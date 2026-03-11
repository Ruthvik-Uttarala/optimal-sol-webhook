const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");
const moment = require("moment-timezone");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ---------- Config ----------
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "America/New_York";
const NOTIFICATION_DEDUPE_WINDOW_MS = Number(process.env.NOTIFICATION_DEDUPE_WINDOW_MS || 2 * 60 * 1000);
const COLLECTION_PREFIX = String(process.env.COLLECTION_PREFIX || "test").trim();
const ENABLE_TOPIC_FALLBACK = toBoolean(process.env.ENABLE_TOPIC_FALLBACK, true);
const ENABLE_S3 = toBoolean(process.env.ENABLE_S3, false);
const AWS_REGION = String(process.env.AWS_REGION || "").trim();
const AWS_BUCKET = String(process.env.AWS_BUCKET || "").trim();
const DEFAULT_LOT_ID = String(process.env.DEFAULT_LOT_ID || "default_lot").trim();
const AUTH_CHECK_REVOKED = toBoolean(process.env.AUTH_CHECK_REVOKED, true);
const VIOLATION_URL_TTL_SECONDS = clampNumber(Number(process.env.VIOLATION_URL_TTL_SECONDS || 600), 60, 86400);
const S3_UPLOAD_TIMEOUT_MS = clampNumber(Number(process.env.S3_UPLOAD_TIMEOUT_MS || 10000), 1000, 60000);

const PREFIXED_COLLECTIONS = new Set(["deviceTokens", "notificationDedupe", "staffUsers"]);
const INVALID_FCM_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered"
]);

let s3Client = null;

// ---------- Generic helpers ----------
function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function createHttpError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function getCollectionName(baseName) {
  if (!PREFIXED_COLLECTIONS.has(baseName)) return baseName;
  if (!COLLECTION_PREFIX) return baseName;
  return `${COLLECTION_PREFIX}_${baseName}`;
}

function normalizePlate(p) {
  if (!p) return "";
  return String(p).trim().toUpperCase().replace(/[\s-]/g, "");
}

function makeRequestId(req) {
  const headerId = req.get("x-request-id");
  if (headerId) return String(headerId);
  return crypto.randomUUID();
}

function pick(obj, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
      else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return null;
}

function toDateOrNow(value) {
  if (!value) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function businessDayKey(date, timeZone = BUSINESS_TIMEZONE) {
  return moment(date).tz(timeZone).format("YYYY-MM-DD");
}

function normalizeRole(value) {
  if (!value) return null;
  const role = String(value).trim().toLowerCase();
  if (role === "admin" || role === "staff") return role;
  return null;
}

function sanitizeS3Segment(value, fallback = "unknown") {
  const raw = String(value || fallback).trim();
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || fallback;
}

function isS3LiveConfigured() {
  return ENABLE_S3 && Boolean(AWS_REGION) && Boolean(AWS_BUCKET);
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return s3Client;
}

function getJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function errorToResponse(err) {
  const statusCode = err?.statusCode || 500;
  const payload = {
    ok: false,
    error: err?.message || "Unexpected error"
  };
  if (err?.code) payload.code = err.code;
  return { statusCode, payload };
}

function makeTokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getEventLotId(rawPayload) {
  const lotId = pick(rawPayload, ["lotId", "siteId", "data.lotId", "payload.lotId", "payload.siteId"]);
  return sanitizeS3Segment(lotId || DEFAULT_LOT_ID, "default_lot");
}

// ---------- Auth / Roles ----------
async function verifyFirebaseAuth(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    throw createHttpError(401, "Missing Bearer token", "auth/missing-bearer");
  }

  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) {
    throw createHttpError(401, "Empty Bearer token", "auth/empty-bearer");
  }

  try {
    return await admin.auth().verifyIdToken(idToken, AUTH_CHECK_REVOKED);
  } catch (err) {
    const code = err?.code || "auth/invalid-token";
    if (code === "auth/id-token-revoked") {
      throw createHttpError(401, "Token revoked", code);
    }
    throw createHttpError(401, "Invalid or expired token", code);
  }
}

async function getUserRole(decodedToken) {
  if (!decodedToken?.uid) {
    throw createHttpError(401, "Missing authenticated user", "auth/missing-user");
  }

  const claimRole = normalizeRole(decodedToken.role);
  if (claimRole) {
    return { role: claimRole, authSource: "custom_claim_role" };
  }
  if (decodedToken.admin === true) {
    return { role: "admin", authSource: "custom_claim_admin_flag" };
  }

  const ref = db.collection(getCollectionName("staffUsers")).doc(decodedToken.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() || {};
    const firestoreRole = normalizeRole(data.role);
    if (firestoreRole) {
      return { role: firestoreRole, authSource: "firestore_staff_user_role" };
    }
    if (data.admin === true) {
      return { role: "admin", authSource: "firestore_staff_user_admin_flag" };
    }
  }

  return { role: null, authSource: "none" };
}

async function assertStaff(decodedToken) {
  const roleInfo = await getUserRole(decodedToken);
  if (!["staff", "admin"].includes(roleInfo.role)) {
    throw createHttpError(403, "Staff role required", "auth/forbidden-staff");
  }
  return roleInfo;
}

async function assertAdmin(decodedToken) {
  const roleInfo = await getUserRole(decodedToken);
  if (roleInfo.role !== "admin") {
    throw createHttpError(403, "Admin role required", "auth/forbidden-admin");
  }
  return roleInfo;
}

// ---------- Existing parking helpers ----------
async function getCameraRole(cameraId) {
  try {
    const snap = await db.collection("cameraConfig").doc(String(cameraId)).get();
    if (snap.exists) return snap.data()?.role || "entry";
  } catch (e) {
    logger.warn("Failed to read camera role; defaulting to entry", { cameraId, error: e?.message || String(e) });
  }
  return "entry";
}

async function isPaid(plateNormalized) {
  if (!plateNormalized) return false;

  const snap = await db.collection("paidSessions").doc(plateNormalized).get();
  if (snap.exists) {
    const data = snap.data() || {};
    const paidUntil = data.paidUntil?.toDate ? data.paidUntil.toDate() : null;
    if (paidUntil && paidUntil.getTime() > Date.now()) return true;
  }

  const nowTs = admin.firestore.Timestamp.now();
  const q = await db.collection("paidSessions")
    .where("plateNormalized", "==", plateNormalized)
    .where("paidUntil", ">=", nowTs)
    .limit(1)
    .get();

  return !q.empty;
}

async function closeStaleEntriesForPlate(carNumber, currentBusinessDay, eventTimeTs, receivedAtTs) {
  const active = await db.collection("parkingEntries")
    .where("carNumber", "==", carNumber)
    .where("status", "==", "entered")
    .get();

  if (active.empty) return 0;

  const batch = db.batch();
  let closed = 0;
  active.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (data.businessDay !== currentBusinessDay) {
      batch.set(docSnap.ref, {
        status: "expired",
        exitTime: eventTimeTs,
        notes: "Auto-closed: stale entry beyond business day",
        updatedAt: receivedAtTs
      }, { merge: true });
      closed += 1;
    }
  });

  if (closed > 0) await batch.commit();
  return closed;
}

// ---------- Notification helpers ----------
async function shouldNotifyDedupe(key, windowMs = NOTIFICATION_DEDUPE_WINDOW_MS) {
  const ref = db.collection(getCollectionName("notificationDedupe")).doc(key);
  const snap = await ref.get();
  const now = Date.now();
  if (snap.exists) {
    const last = snap.data()?.lastNotifiedAt?.toDate ? snap.data().lastNotifiedAt.toDate().getTime() : 0;
    if (now - last < windowMs) return false;
  }

  await ref.set({
    lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return true;
}

async function listActiveStaffDeviceTokens() {
  const snap = await db.collection(getCollectionName("deviceTokens"))
    .where("active", "==", true)
    .get();

  const records = [];
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const token = String(data.token || "").trim();
    const role = normalizeRole(data.role);
    if (!token) return;
    if (!["staff", "admin"].includes(role)) return;

    records.push({
      docId: docSnap.id,
      token,
      tokenHash: data.tokenHash || docSnap.id,
      uid: data.uid || null,
      role
    });
  });

  return records;
}

async function deactivateDeviceTokenHashes(tokenHashes, reason) {
  if (!tokenHashes.length) return;

  const unique = Array.from(new Set(tokenHashes));
  const batch = db.batch();
  unique.forEach((tokenHash) => {
    const ref = db.collection(getCollectionName("deviceTokens")).doc(tokenHash);
    batch.set(ref, {
      active: false,
      invalidatedAt: admin.firestore.FieldValue.serverTimestamp(),
      invalidationReason: reason || "invalid_token",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  await batch.commit();
}

function buildViolationNotificationMessage({ violationId, plateNormalized, cameraId, cameraName, eventTimeIso }) {
  return {
    notification: {
      title: "UNPAID VEHICLE",
      body: `${plateNormalized} at ${cameraName} (${eventTimeIso})`
    },
    data: {
      violationId: String(violationId),
      plateNormalized: String(plateNormalized),
      cameraId: String(cameraId),
      cameraName: String(cameraName),
      eventTime: String(eventTimeIso),
      route: "/violations/detail"
    },
    android: { priority: "high" }
  };
}

async function sendViolationNotification(payload, requestId) {
  const tokenRecords = await listActiveStaffDeviceTokens();
  const invalidTokenHashes = [];

  let tokenSuccessCount = 0;
  let tokenFailureCount = 0;

  const chunkSize = 500;
  for (let i = 0; i < tokenRecords.length; i += chunkSize) {
    const chunk = tokenRecords.slice(i, i + chunkSize);
    const tokens = chunk.map((r) => r.token);
    if (!tokens.length) continue;

    const baseMessage = buildViolationNotificationMessage(payload);
    try {
      const result = await admin.messaging().sendEachForMulticast({
        ...baseMessage,
        tokens
      });

      result.responses.forEach((response, idx) => {
        if (response.success) {
          tokenSuccessCount += 1;
          return;
        }
        tokenFailureCount += 1;
        const errorCode = response.error?.code;
        if (INVALID_FCM_TOKEN_CODES.has(errorCode)) {
          invalidTokenHashes.push(chunk[idx].tokenHash || chunk[idx].docId);
        }
      });
    } catch (err) {
      tokenFailureCount += tokens.length;
      logger.error("Failed multicast token send", {
        requestId,
        errorMessage: err?.message || String(err),
        tokensInChunk: tokens.length
      });
    }
  }

  if (invalidTokenHashes.length) {
    await deactivateDeviceTokenHashes(invalidTokenHashes, "fcm_invalid_or_unregistered");
  }

  let topicSent = false;
  let topicError = null;
  if (ENABLE_TOPIC_FALLBACK && (tokenRecords.length === 0 || tokenSuccessCount === 0)) {
    try {
      await admin.messaging().send({
        topic: "staff",
        ...buildViolationNotificationMessage(payload)
      });
      topicSent = true;
    } catch (err) {
      topicError = err?.message || String(err);
      logger.error("Topic fallback send failed", {
        requestId,
        errorMessage: topicError
      });
    }
  }

  return {
    attemptedTokenCount: tokenRecords.length,
    tokenSuccessCount,
    tokenFailureCount,
    invalidatedTokenCount: Array.from(new Set(invalidTokenHashes)).length,
    topicFallbackEnabled: ENABLE_TOPIC_FALLBACK,
    topicSent,
    topicError
  };
}

// ---------- S3 / Evidence helpers ----------
function buildS3Key({ lotId, eventTime, cameraId, plateNormalized, eventId, filename = "plate.jpg" }) {
  const safeLotId = sanitizeS3Segment(lotId || DEFAULT_LOT_ID, "default_lot");
  const safeDate = businessDayKey(eventTime || new Date(), BUSINESS_TIMEZONE);
  const safeCamera = sanitizeS3Segment(cameraId || "unknown_camera", "unknown_camera");
  const safePlate = sanitizeS3Segment(plateNormalized || "UNKNOWN", "UNKNOWN");
  const safeEventId = sanitizeS3Segment(eventId || crypto.randomUUID(), "unknown_event");
  const safeFilename = sanitizeS3Segment(filename, "plate.jpg");

  return `violations/${safeLotId}/${safeDate}/${safeCamera}/${safePlate}/${safeEventId}/${safeFilename}`;
}

async function fetchImageBuffer(sourceImageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), S3_UPLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(sourceImageUrl, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`Failed to fetch source image (${resp.status})`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadEvidenceToS3({ sourceImageUrl, s3ObjectKey, metadata = {} }) {
  const liveConfigured = isS3LiveConfigured();

  if (!sourceImageUrl) {
    return {
      uploaded: false,
      mocked: !liveConfigured,
      status: liveConfigured ? "aws_pending" : "mock_only",
      s3ObjectKey,
      bucket: AWS_BUCKET || null,
      message: "No source evidence URL available for upload"
    };
  }

  if (!liveConfigured) {
    return {
      uploaded: false,
      mocked: true,
      status: "ready_for_aws",
      s3ObjectKey,
      bucket: AWS_BUCKET || null,
      message: "S3 disabled or missing AWS config"
    };
  }

  try {
    const { buffer, contentType } = await fetchImageBuffer(sourceImageUrl);
    const putCommand = new PutObjectCommand({
      Bucket: AWS_BUCKET,
      Key: s3ObjectKey,
      Body: buffer,
      ContentType: contentType,
      Metadata: Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [String(k).toLowerCase(), String(v)])
      )
    });

    await getS3Client().send(putCommand);

    return {
      uploaded: true,
      mocked: false,
      status: "uploaded",
      s3ObjectKey,
      bucket: AWS_BUCKET,
      contentType,
      sizeBytes: buffer.length,
      message: "Uploaded to S3"
    };
  } catch (err) {
    logger.error("S3 evidence upload failed", {
      s3ObjectKey,
      errorMessage: err?.message || String(err)
    });
    return {
      uploaded: false,
      mocked: false,
      status: "aws_pending",
      s3ObjectKey,
      bucket: AWS_BUCKET,
      message: err?.message || "S3 upload failed"
    };
  }
}

async function createSignedUrl({ s3ObjectKey, ttlSeconds = VIOLATION_URL_TTL_SECONDS }) {
  if (!s3ObjectKey) {
    throw createHttpError(400, "Missing S3 object key", "s3/missing-object-key");
  }

  const expiresInSeconds = clampNumber(Number(ttlSeconds || VIOLATION_URL_TTL_SECONDS), 60, 86400);
  if (!isS3LiveConfigured()) {
    return {
      ok: true,
      mocked: true,
      s3ObjectKey,
      bucket: AWS_BUCKET || null,
      region: AWS_REGION || null,
      expiresInSeconds,
      message: "S3 live mode is disabled or incomplete; returning mock response"
    };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: AWS_BUCKET,
      Key: s3ObjectKey
    });
    const url = await getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds });

    return {
      ok: true,
      mocked: false,
      url,
      s3ObjectKey,
      bucket: AWS_BUCKET,
      region: AWS_REGION,
      expiresInSeconds
    };
  } catch (err) {
    throw createHttpError(500, `Failed to generate signed URL: ${err?.message || String(err)}`, "s3/signed-url-failed");
  }
}

// ---------- MAIN WEBHOOK ----------
exports.unifiWebhook = onRequest(async (req, res) => {
  const requestId = makeRequestId(req);

  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const raw = getJsonBody(req);
    if (!raw || (typeof raw === "object" && Object.keys(raw).length === 0)) {
      return res.status(400).send("Empty JSON payload");
    }

    const secret = process.env.UNIFI_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = req.get("x-unifi-secret");
      if (headerSecret !== secret) return res.status(401).send("Unauthorized");
    }

    const rawString = JSON.stringify(raw);
    const eventHash = crypto.createHash("sha256").update(rawString).digest("hex");
    const receivedAt = admin.firestore.FieldValue.serverTimestamp();

    const plateRaw = pick(raw, ["plate", "licensePlate", "lpr.plate", "data.plate", "payload.plate"]) || "";
    const plateNormalized = normalizePlate(plateRaw);

    const cameraId = pick(raw, ["cameraId", "camera.id", "camera", "data.cameraId", "payload.cameraId"]) || "unknown_camera";
    const cameraName = pick(raw, ["cameraName", "camera.name", "data.cameraName", "payload.cameraName"]) || String(cameraId);

    const confidence = pick(raw, ["confidence", "lpr.confidence", "data.confidence", "payload.confidence"]);
    const eventTimeStr = pick(raw, ["timestamp", "time", "eventTime", "data.timestamp", "payload.timestamp"]);
    const eventTime = toDateOrNow(eventTimeStr);
    const eventTimeTs = admin.firestore.Timestamp.fromDate(eventTime);
    const currentBusinessDay = businessDayKey(eventTime);

    const evidenceSnapshotUrl = pick(raw, ["snapshotUrl", "snapshot.url", "imageUrl", "payload.snapshotUrl"]);
    const evidenceThumbnailUrl = pick(raw, ["thumbnailUrl", "thumbnail.url", "payload.thumbnailUrl"]);
    const sourceEvidenceUrl = evidenceSnapshotUrl || evidenceThumbnailUrl || null;

    const role = await getCameraRole(String(cameraId));

    const eventBase = {
      source: "unifi_protect",
      requestId,
      eventId: eventHash,
      receivedAt,
      cameraId,
      cameraName,
      role,
      plateRaw,
      plateNormalized,
      confidence: confidence ?? null,
      eventTime: eventTimeTs,
      businessDay: currentBusinessDay,
      raw
    };

    await db.collection("unifi_webhook_events").doc(eventHash).set({
      ...eventBase
    }, { merge: true });

    await db.collection("events").doc(eventHash).set({
      ...eventBase,
      status: "received"
    }, { merge: true });

    if (plateNormalized) {
      await db.collection("plateIndex").doc(plateNormalized).set({
        plateNormalized,
        plateRawLatest: plateRaw || null,
        lastEventId: eventHash,
        lastCameraId: String(cameraId),
        lastSeenAt: eventTimeTs,
        updatedAt: receivedAt
      }, { merge: true });
    }

    const paid = await isPaid(plateNormalized);
    await db.collection("events").doc(eventHash).set({
      paid,
      status: "processed"
    }, { merge: true });

    const customerRefDoc = db.doc("Customers/UNIFI_UNKNOWN");
    const vehicleRefDoc = plateNormalized ? db.doc(`vehicles/${plateNormalized}`) : db.doc("vehicles/UNIFI_UNKNOWN");
    const spotRefDoc = db.doc("parkingSpots/UNKNOWN");

    if (plateNormalized) {
      await vehicleRefDoc.set({
        carNumber: plateNormalized,
        updatedAt: receivedAt,
        createdAt: receivedAt
      }, { merge: true });
    }

    const parkingEntryId = `UP${eventHash.slice(0, 6).toUpperCase()}`;
    const car = plateNormalized || plateRaw || "UNKNOWN";

    if (role === "entry") {
      const staleClosed = await closeStaleEntriesForPlate(car, currentBusinessDay, eventTimeTs, receivedAt);
      if (staleClosed > 0) {
        logger.info("Closed stale entries from previous business day", {
          requestId,
          eventId: eventHash,
          plateNormalized,
          staleClosed
        });
      }

      await db.collection("parkingEntries").doc(eventHash).set({
        amount: 0,
        businessDay: currentBusinessDay,
        carNumber: car,
        createdAt: eventTimeTs,
        customerId: customerRefDoc,
        customerName: "Unknown",
        customerRef: "/customers/UNIFI_UNKNOWN",
        entryTime: eventTimeTs,
        exitTime: null,
        notes: paid ? "Paid entry (UniFi)" : "Unpaid entry (UniFi)",
        parkingEntryId,
        spotNumber: "UNKNOWN",
        spotRef: spotRefDoc,
        status: "entered",
        updatedAt: receivedAt,
        vehicleRef: vehicleRefDoc
      }, { merge: true });
    } else {
      const q = await db.collection("parkingEntries")
        .where("carNumber", "==", car)
        .where("status", "==", "entered")
        .orderBy("entryTime", "desc")
        .limit(1)
        .get();

      if (!q.empty) {
        const doc = q.docs[0];
        await doc.ref.set({
          exitTime: eventTimeTs,
          status: "exited",
          updatedAt: receivedAt,
          notes: "Exited (UniFi)"
        }, { merge: true });
      } else {
        await db.collection("parkingEntries").doc(eventHash).set({
          amount: 0,
          businessDay: currentBusinessDay,
          carNumber: car,
          createdAt: eventTimeTs,
          customerId: customerRefDoc,
          customerName: "Unknown",
          customerRef: "/customers/UNIFI_UNKNOWN",
          entryTime: eventTimeTs,
          exitTime: eventTimeTs,
          notes: "Exit received but no active entry found (UniFi)",
          parkingEntryId,
          spotNumber: "UNKNOWN",
          spotRef: spotRefDoc,
          status: "exited",
          updatedAt: receivedAt,
          vehicleRef: vehicleRefDoc
        }, { merge: true });
      }
    }

    let violationCreated = false;
    let violationId = null;
    let notificationResult = null;

    if (!paid && plateNormalized) {
      violationId = eventHash;

      const lotId = getEventLotId(raw);
      const s3ObjectKey = buildS3Key({
        lotId,
        eventTime,
        cameraId,
        plateNormalized,
        eventId: eventHash,
        filename: "plate.jpg"
      });

      const uploadResult = await uploadEvidenceToS3({
        sourceImageUrl: sourceEvidenceUrl,
        s3ObjectKey,
        metadata: {
          eventId: eventHash,
          plateNormalized,
          cameraId: String(cameraId)
        }
      });

      await db.collection("violations").doc(violationId).set({
        evidence: {
          snapshotUrl: evidenceSnapshotUrl || null,
          thumbnailUrl: evidenceThumbnailUrl || null,
          sourceImageUrl,
          s3ObjectKey,
          s3Bucket: uploadResult.bucket || null,
          status: uploadResult.status,
          mocked: Boolean(uploadResult.mocked),
          uploaded: Boolean(uploadResult.uploaded),
          contentType: uploadResult.contentType || null,
          sizeBytes: uploadResult.sizeBytes || null,
          lastError: uploadResult.uploaded ? null : uploadResult.message,
          aws: {
            enableS3: ENABLE_S3,
            liveConfigured: isS3LiveConfigured(),
            region: AWS_REGION || null,
            bucket: AWS_BUCKET || null
          },
          updatedAt: receivedAt
        },
        eventId: eventHash,
        plateNormalized,
        plateRaw,
        cameraId,
        cameraName,
        role,
        confidence: confidence ?? null,
        eventTime: eventTimeTs,
        status: "open",
        severity: "high",
        createdAt: receivedAt,
        updatedAt: receivedAt
      }, { merge: true });
      violationCreated = true;

      const dedupeKey = `${plateNormalized}_${cameraId}`;
      const okToNotify = await shouldNotifyDedupe(dedupeKey, NOTIFICATION_DEDUPE_WINDOW_MS);
      if (okToNotify) {
        try {
          notificationResult = await sendViolationNotification({
            violationId,
            plateNormalized,
            cameraId,
            cameraName,
            eventTimeIso: eventTime.toISOString()
          }, requestId);
        } catch (notifyErr) {
          notificationResult = {
            failed: true,
            error: notifyErr?.message || String(notifyErr)
          };
          logger.error("Violation notification dispatch failed", {
            requestId,
            violationId,
            errorMessage: notifyErr?.message || String(notifyErr)
          });
        }
      } else {
        notificationResult = {
          skipped: true,
          reason: "dedupe_window"
        };
      }
    }

    logger.info("Processed UniFi webhook", {
      requestId,
      eventHash,
      plateNormalized,
      cameraId,
      role,
      paid,
      violationCreated,
      violationId,
      notificationResult
    });

    return res.status(200).json({
      ok: true,
      requestId,
      id: eventHash,
      paid,
      role,
      violationCreated,
      violationId
    });
  } catch (err) {
    logger.error("Webhook error", {
      requestId,
      errorMessage: err?.message || String(err),
      errorStack: err?.stack || null
    });
    const { statusCode, payload } = errorToResponse(err);
    return res.status(statusCode).json({ ...payload, requestId });
  }
});

// ---------- Protected endpoints ----------
exports.adminDiagnostics = onRequest(async (req, res) => {
  const requestId = makeRequestId(req);
  try {
    const decoded = await verifyFirebaseAuth(req);
    const roleInfo = await assertAdmin(decoded);

    return res.status(200).json({
      ok: true,
      uid: decoded.uid,
      email: decoded.email || null,
      role: roleInfo.role,
      authSource: roleInfo.authSource,
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (err) {
    logger.error("Auth failure on adminDiagnostics", {
      requestId,
      errorMessage: err?.message || String(err),
      errorStack: err?.stack || null
    });
    const { statusCode, payload } = errorToResponse(err);
    return res.status(statusCode).json({ ...payload, requestId });
  }
});

exports.registerDeviceToken = onRequest(async (req, res) => {
  const requestId = makeRequestId(req);
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const decoded = await verifyFirebaseAuth(req);
    const roleInfo = await assertStaff(decoded);

    const body = getJsonBody(req);
    const token = String(body.token || "").trim();
    const platform = body.platform ? String(body.platform).trim().toLowerCase() : null;

    if (!token) {
      throw createHttpError(400, "Field 'token' is required", "validation/missing-token");
    }

    const tokenHash = makeTokenHash(token);
    const ref = db.collection(getCollectionName("deviceTokens")).doc(tokenHash);

    await ref.set({
      token,
      tokenHash,
      uid: decoded.uid,
      role: roleInfo.role,
      platform,
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRegisteredAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      requestId,
      tokenHash,
      role: roleInfo.role,
      authSource: roleInfo.authSource
    });
  } catch (err) {
    logger.error("registerDeviceToken failed", {
      requestId,
      errorMessage: err?.message || String(err),
      errorStack: err?.stack || null
    });
    const { statusCode, payload } = errorToResponse(err);
    return res.status(statusCode).json({ ...payload, requestId });
  }
});

exports.getViolationImageUrl = onRequest(async (req, res) => {
  const requestId = makeRequestId(req);
  try {
    if (!["GET", "POST"].includes(req.method)) return res.status(405).send("Method Not Allowed");

    const decoded = await verifyFirebaseAuth(req);
    const roleInfo = await assertStaff(decoded);

    const body = getJsonBody(req);
    const violationId = String(req.query.violationId || body.violationId || "").trim();
    const ttlSeconds = Number(req.query.ttlSeconds || body.ttlSeconds || VIOLATION_URL_TTL_SECONDS);

    if (!violationId) {
      throw createHttpError(400, "violationId is required", "validation/missing-violation-id");
    }

    const snap = await db.collection("violations").doc(violationId).get();
    if (!snap.exists) {
      throw createHttpError(404, "Violation not found", "violations/not-found");
    }

    const violation = snap.data() || {};
    const s3ObjectKey = pick(violation, ["evidence.s3ObjectKey", "s3ObjectKey"]);
    if (!s3ObjectKey) {
      throw createHttpError(404, "Violation has no evidence object key", "violations/no-evidence-key");
    }

    const signed = await createSignedUrl({
      s3ObjectKey: String(s3ObjectKey),
      ttlSeconds
    });

    return res.status(200).json({
      ...signed,
      violationId,
      role: roleInfo.role,
      authSource: roleInfo.authSource,
      requestId
    });
  } catch (err) {
    logger.error("getViolationImageUrl failed", {
      requestId,
      errorMessage: err?.message || String(err),
      errorStack: err?.stack || null
    });
    const { statusCode, payload } = errorToResponse(err);
    return res.status(statusCode).json({ ...payload, requestId });
  }
});

// ---------- Scheduled cleanup of stale parking entries ----------
exports.cleanupStaleBusinessDayEntries = onSchedule(
  { schedule: "0 1 * * *", timeZone: BUSINESS_TIMEZONE },
  async () => {
    const now = admin.firestore.Timestamp.now().toDate();
    const currentBusinessDay = businessDayKey(now);

    const snap = await db.collection("parkingEntries")
      .where("status", "==", "entered")
      .get();

    const batch = db.batch();
    let removed = 0;

    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.businessDay && data.businessDay !== currentBusinessDay) {
        batch.delete(doc.ref);
        removed += 1;
      }
    });

    if (removed > 0) {
      await batch.commit();
    }

    logger.info("Scheduled stale business-day entries cleanup", {
      removed,
      currentBusinessDay
    });
  }
);

// ---------- Stale entry cleanup ----------
exports.flagUnpaidAfter24h = onSchedule("every 60 minutes", async () => {
  const now = Date.now();
  const cutoff = new Date(now - 24 * 60 * 60 * 1000);
  const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

  const snap = await db.collection("parkingEntries")
    .where("status", "==", "entered")
    .where("entryTime", "<=", cutoffTs)
    .get();

  const batch = db.batch();
  let count = 0;
  snap.docs.forEach((d) => {
    batch.set(d.ref, {
      status: "expired",
      exitTime: cutoffTs,
      notes: "Auto-closed: beyond one business day",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    count += 1;
  });

  if (count > 0) await batch.commit();
  logger.info("Stale parking entries cleanup complete", { closedEntries: count });
});
