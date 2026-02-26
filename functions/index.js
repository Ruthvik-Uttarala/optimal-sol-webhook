const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// ---------- Helpers ----------
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "America/New_York";
const NOTIFICATION_DEDUPE_WINDOW_MS = Number(process.env.NOTIFICATION_DEDUPE_WINDOW_MS || 2 * 60 * 1000);

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
      else { ok = false; break; }
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function getCameraRole(cameraId) {
  try {
    const snap = await db.collection("cameraConfig").doc(String(cameraId)).get();
    if (snap.exists) return snap.data()?.role || "entry";
  } catch (e) {}
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

async function shouldNotifyDedupe(key, windowMs = 2 * 60 * 1000) {
  const ref = db.collection("notificationDedupe").doc(key);
  const snap = await ref.get();
  const now = Date.now();
  if (snap.exists) {
    const last = snap.data()?.lastNotifiedAt?.toDate ? snap.data().lastNotifiedAt.toDate().getTime() : 0;
    if (now - last < windowMs) return false;
  }
  await ref.set({ lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

async function verifyFirebaseAuth(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    const e = new Error("Missing Bearer token");
    e.statusCode = 401;
    throw e;
  }
  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) {
    const e = new Error("Empty Bearer token");
    e.statusCode = 401;
    throw e;
  }
  return admin.auth().verifyIdToken(idToken);
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

// ---------- MAIN WEBHOOK ----------
exports.unifiWebhook = onRequest(async (req, res) => {
  const requestId = makeRequestId(req);
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const raw = req.body;
    if (!raw || (typeof raw === "object" && Object.keys(raw).length === 0)) {
      return res.status(400).send("Empty JSON payload");
    }

    // Optional shared secret check (only enforced if you set UNIFI_WEBHOOK_SECRET)
    const secret = process.env.UNIFI_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = req.get("x-unifi-secret");
      if (headerSecret !== secret) return res.status(401).send("Unauthorized");
    }

    const rawString = JSON.stringify(raw);
    const eventHash = crypto.createHash("sha256").update(rawString).digest("hex");
    const receivedAt = admin.firestore.FieldValue.serverTimestamp();

    // Best-effort extraction (works now; later we refine once real UniFi payload arrives)
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

    // 1) Store raw UniFi metadata EXACTLY + canonical events schema
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

    // 2) Paid check + unpaid decision
    const paid = await isPaid(plateNormalized);
    await db.collection("events").doc(eventHash).set({
      paid,
      status: "processed"
    }, { merge: true });

    // 3) Update FlutterFlow-linked parkingEntries using EXACT schema fields
    // References (safe defaults)
    const customerRefDoc = db.doc("Customers/UNIFI_UNKNOWN");
    const vehicleRefDoc = plateNormalized ? db.doc(`vehicles/${plateNormalized}`) : db.doc("vehicles/UNIFI_UNKNOWN");
    const spotRefDoc = db.doc("parkingSpots/UNKNOWN");

    // Ensure vehicle doc exists (so vehicleRef is valid)
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

      // Create a new entry doc
      await db.collection("parkingEntries").doc(eventHash).set({
        amount: paid ? 0 : 0, // keep 0 for now (payment logic can fill later)
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
      // Exit: find latest "entered" record for same carNumber and close it
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
        // If no open entry found, still write a record for audit
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

    // 4) If unpaid -> create violation + notify (with dedupe)
    let violationCreated = false;
    let violationId = null;
    if (!paid && plateNormalized) {
      violationId = eventHash;
      await db.collection("violations").doc(violationId).set({
        evidence: {
          snapshotUrl: evidenceSnapshotUrl || null,
          thumbnailUrl: evidenceThumbnailUrl || null,
          s3ObjectKey: null,
          status: evidenceSnapshotUrl || evidenceThumbnailUrl ? "captured_from_unifi_reference" : "pending_capture"
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
        createdAt: receivedAt
      }, { merge: true });
      violationCreated = true;

      const dedupeKey = `${plateNormalized}_${cameraId}`;
      const okToNotify = await shouldNotifyDedupe(dedupeKey, NOTIFICATION_DEDUPE_WINDOW_MS);

      if (okToNotify) {
        // Push notification to staff topic (FlutterFlow can subscribe to "staff")
        await admin.messaging().send({
          topic: "staff",
          notification: {
            title: "UNPAID VEHICLE",
            body: `${plateNormalized} at ${cameraName} (${eventTime.toISOString()})`
          },
          data: {
            plate: plateNormalized,
            camera: String(cameraName),
            eventTime: eventTime.toISOString(),
            violationId
          },
          android: { priority: "high" }
        });
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
      violationId
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
    const statusCode = err?.statusCode || 500;
    return res.status(statusCode).json({ ok: false, requestId, error: String(err?.message || err) });
  }
});

// ---------- Auth-required admin endpoint ----------
exports.adminDiagnostics = onRequest(async (req, res) => {
  try {
    const decoded = await verifyFirebaseAuth(req);
    return res.status(200).json({
      ok: true,
      uid: decoded.uid,
      email: decoded.email || null,
      ts: new Date().toISOString()
    });
  } catch (err) {
    logger.error("Auth failure on adminDiagnostics", {
      errorMessage: err?.message || String(err),
      errorStack: err?.stack || null
    });
    return res.status(err?.statusCode || 401).json({ ok: false, error: err?.message || "Unauthorized" });
  }
});

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
  snap.docs.forEach(d => {
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
