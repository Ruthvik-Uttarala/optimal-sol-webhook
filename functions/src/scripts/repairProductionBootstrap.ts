import admin from "firebase-admin";
import { COLLECTIONS } from "../config/constants";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT
  });
}

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

function required(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  targetUid: required("PARKINGSOL_TARGET_UID"),
  targetEmail: String(process.env.PARKINGSOL_TARGET_EMAIL || "").trim() || null,
  targetDisplayName: String(process.env.PARKINGSOL_TARGET_DISPLAY_NAME || "").trim() || null,
  targetRole: String(process.env.PARKINGSOL_TARGET_ROLE || "admin").trim(),
  organizationId: String(process.env.PARKINGSOL_ORG_ID || "org_parksol_main").trim(),
  organizationName: String(process.env.PARKINGSOL_ORG_NAME || "ParkingSol").trim(),
  lotId: String(process.env.PARKINGSOL_LOT_ID || "lot_parksol_main").trim(),
  lotName: String(process.env.PARKINGSOL_LOT_NAME || "ParkingSol Main Lot").trim(),
  sourceId: String(process.env.PARKINGSOL_SOURCE_ID || "src_postman_main").trim(),
  sourceKey: String(process.env.PARKINGSOL_SOURCE_KEY || "postman-main-gate-entry").trim(),
  environmentLabel: String(process.env.PARKINGSOL_ENV_LABEL || "Production").trim()
};

async function upsertBaselineDocuments() {
  const accessId = `access_${config.targetUid}_${config.lotId}`;
  const userRef = db.collection(COLLECTIONS.users).doc(config.targetUid);
  const existingUser = await userRef.get();
  const currentUser = existingUser.exists ? existingUser.data() || {} : {};

  const batch = db.batch();

  batch.set(
    db.collection(COLLECTIONS.organizations).doc(config.organizationId),
    {
      id: config.organizationId,
      name: config.organizationName,
      status: "active",
      timezone: "America/New_York",
      updatedAt: now,
      createdAt: currentUser.createdAt || now
    },
    { merge: true }
  );

  batch.set(
    db.collection(COLLECTIONS.lots).doc(config.lotId),
    {
      id: config.lotId,
      organizationId: config.organizationId,
      name: config.lotName,
      status: "active",
      timezone: "America/New_York",
      duplicateWindowSecondsDefault: 120,
      gracePeriodMinutesDefault: 10,
      enforcementEnabled: true,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  );

  batch.set(
    db.collection(COLLECTIONS.sources).doc(config.sourceId),
    {
      id: config.sourceId,
      organizationId: config.organizationId,
      lotId: config.lotId,
      name: "Postman Main Source",
      sourceKey: config.sourceKey,
      type: "postman",
      status: "active",
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  );

  batch.set(
    userRef,
    {
      id: config.targetUid,
      email: config.targetEmail || currentUser.email || null,
      displayName: config.targetDisplayName || currentUser.displayName || config.targetEmail || config.targetUid,
      status: currentUser.status || "active",
      globalRole: currentUser.globalRole || config.targetRole,
      defaultOrganizationId: currentUser.defaultOrganizationId || config.organizationId,
      defaultLotId: currentUser.defaultLotId || config.lotId,
      notificationPreferences: currentUser.notificationPreferences || {
        inAppViolations: true,
        inAppSystemAlerts: true,
        inAppAssignments: true,
        soundEnabled: false,
        digestEnabled: false
      },
      lastLoginAt: currentUser.lastLoginAt || null,
      updatedAt: now,
      createdAt: currentUser.createdAt || now,
      createdByUserId: currentUser.createdByUserId || null
    },
    { merge: true }
  );

  batch.set(
    db.collection(COLLECTIONS.userLotAccess).doc(accessId),
    {
      id: accessId,
      userId: config.targetUid,
      organizationId: config.organizationId,
      lotId: config.lotId,
      roleWithinLot: config.targetRole,
      status: "active",
      updatedAt: now,
      createdAt: now,
      createdByUserId: config.targetUid
    },
    { merge: true }
  );

  const rules = [
    {
      id: "rule_bootstrap_grace_period",
      name: "Grace Period",
      type: "grace_period",
      priority: 10,
      conditions: { minutes: 10 },
      actions: {}
    },
    {
      id: "rule_bootstrap_duplicate_window",
      name: "Duplicate Suppression",
      type: "duplicate_window",
      priority: 20,
      conditions: { seconds: 120 },
      actions: {}
    },
    {
      id: "rule_bootstrap_enforcement_hours",
      name: "Enforcement Hours",
      type: "enforcement_hours",
      priority: 30,
      conditions: { startHour: 0, endHour: 24 },
      actions: {}
    },
    {
      id: "rule_bootstrap_notification_routing",
      name: "Notification Routing",
      type: "notification_routing",
      priority: 40,
      conditions: {},
      actions: { targetRoles: ["admin", "operator", "manager", "support"] }
    },
    {
      id: "rule_bootstrap_default_violation",
      name: "Default Violation",
      type: "violation_threshold",
      priority: 50,
      conditions: { trigger: "default_unpaid" },
      actions: { createViolation: true }
    }
  ];

  for (const rule of rules) {
    batch.set(
      db.collection(COLLECTIONS.rules).doc(rule.id),
      {
        ...rule,
        organizationId: config.organizationId,
        lotId: config.lotId,
        status: "active",
        updatedAt: now,
        createdAt: now,
        createdByUserId: config.targetUid,
        updatedByUserId: config.targetUid
      },
      { merge: true }
    );
  }

  batch.set(
    db.collection(COLLECTIONS.systemConfig).doc("global"),
    {
      id: "global",
      environmentLabel: config.environmentLabel,
      timezone: "America/New_York",
      retentionDays: 14,
      defaultPageSize: 25,
      notificationDefaults: {
        inAppViolations: true,
        inAppSystemAlerts: true,
        inAppAssignments: true
      },
      sourceMetadataDefaults: {
        provider: "postman"
      },
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  );

  await batch.commit();
}

async function main() {
  await upsertBaselineDocuments();
  console.log(`Bootstrap repair complete for ${config.targetUid} in ${config.organizationId}/${config.lotId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
