import admin from "firebase-admin";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const projectId = process.env.GCLOUD_PROJECT || "parking-sol-local";
if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

async function seedAuth() {
  const auth = admin.auth();
  const users = [
    {
      uid: "uid_admin_001",
      email: "admin@parkingsol.local",
      password: "Password123!",
      displayName: "Admin User",
      role: "admin"
    },
    {
      uid: "uid_operator_001",
      email: "operator@parkingsol.local",
      password: "Password123!",
      displayName: "Operator User",
      role: "operator"
    },
    {
      uid: "uid_support_001",
      email: "support@parkingsol.local",
      password: "Password123!",
      displayName: "Support User",
      role: "support"
    }
  ];

  for (const user of users) {
    try {
      await auth.getUser(user.uid);
    } catch {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password: user.password,
        displayName: user.displayName
      });
    }
  }
}

async function seedFirestore() {
  const orgId = "org_demo_001";
  const lotId = "lot_demo_001";
  const sourceId = "src_postman_001";

  const docs = [
    [
      "organizations",
      orgId,
      {
        id: orgId,
        name: "ParkingSol Demo Org",
        slug: "parkingsol-demo",
        status: "active",
        primaryContactName: "Ops Admin",
        primaryContactEmail: "admin@parkingsol.local",
        timezone: "America/New_York",
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001",
        settingsSummary: { environment: "Test" }
      }
    ],
    [
      "lots",
      lotId,
      {
        id: lotId,
        organizationId: orgId,
        name: "Main Demo Lot",
        slug: "main-demo-lot",
        status: "active",
        timezone: "America/New_York",
        addressLine1: "100 Demo Street",
        addressLine2: null,
        city: "New York",
        state: "NY",
        postalCode: "10001",
        country: "US",
        capacity: 120,
        enforcementEnabled: true,
        testModeEnabled: true,
        gracePeriodMinutesDefault: 10,
        duplicateWindowSecondsDefault: 120,
        entryPolicyMode: "event_driven",
        exitPolicyMode: "event_driven",
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "users",
      "uid_admin_001",
      {
        id: "uid_admin_001",
        email: "admin@parkingsol.local",
        displayName: "Admin User",
        status: "active",
        globalRole: "admin",
        defaultOrganizationId: orgId,
        defaultLotId: lotId,
        phoneNumber: null,
        avatarUrl: null,
        notificationPreferences: {
          inAppViolations: true,
          inAppSystemAlerts: true,
          inAppAssignments: true,
          soundEnabled: false,
          digestEnabled: false
        },
        createdAt: now,
        updatedAt: now,
        createdByUserId: null
      }
    ],
    [
      "users",
      "uid_operator_001",
      {
        id: "uid_operator_001",
        email: "operator@parkingsol.local",
        displayName: "Operator User",
        status: "active",
        globalRole: "operator",
        defaultOrganizationId: orgId,
        defaultLotId: lotId,
        phoneNumber: null,
        avatarUrl: null,
        notificationPreferences: {
          inAppViolations: true,
          inAppSystemAlerts: true,
          inAppAssignments: true,
          soundEnabled: false,
          digestEnabled: false
        },
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "users",
      "uid_support_001",
      {
        id: "uid_support_001",
        email: "support@parkingsol.local",
        displayName: "Support User",
        status: "active",
        globalRole: "support",
        defaultOrganizationId: orgId,
        defaultLotId: lotId,
        phoneNumber: null,
        avatarUrl: null,
        notificationPreferences: {
          inAppViolations: true,
          inAppSystemAlerts: true,
          inAppAssignments: true,
          soundEnabled: false,
          digestEnabled: false
        },
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "userLotAccess",
      "access_uid_admin_001_lot_demo_001",
      {
        id: "access_uid_admin_001_lot_demo_001",
        userId: "uid_admin_001",
        organizationId: orgId,
        lotId,
        roleWithinLot: "admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "userLotAccess",
      "access_uid_operator_001_lot_demo_001",
      {
        id: "access_uid_operator_001_lot_demo_001",
        userId: "uid_operator_001",
        organizationId: orgId,
        lotId,
        roleWithinLot: "operator",
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "userLotAccess",
      "access_uid_support_001_lot_demo_001",
      {
        id: "access_uid_support_001_lot_demo_001",
        userId: "uid_support_001",
        organizationId: orgId,
        lotId,
        roleWithinLot: "support",
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "sources",
      sourceId,
      {
        id: sourceId,
        organizationId: orgId,
        lotId,
        name: "Postman Main Gate",
        sourceKey: "postman-main-gate-entry",
        type: "postman",
        status: "active",
        directionMode: "bidirectional",
        cameraLabel: "Entry Gate Camera",
        laneLabel: "lane-1",
        sharedSecretId: "client_postman_001",
        metadata: { isTestSource: true },
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "apiClients",
      "client_postman_001",
      {
        id: "client_postman_001",
        organizationId: orgId,
        lotId,
        name: "Postman Seed Client",
        type: "postman",
        status: "active",
        publicKey: null,
        secretHash:
          "e2186dbdb1bb4193608605e84f33208765b5693b55edd4f730a719a100eeea6f",
        allowedIps: [],
        allowedRoutes: ["/api/v1/webhooks/postman/events"],
        createdAt: now,
        updatedAt: now
      }
    ],
    [
      "rules",
      "rule_default_grace_001",
      {
        id: "rule_default_grace_001",
        organizationId: orgId,
        lotId,
        name: "Default Grace",
        description: "Default grace period before violation",
        type: "grace_period",
        status: "active",
        priority: 10,
        conditions: { minutes: 10 },
        actions: { allow: true },
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001",
        updatedByUserId: "uid_admin_001"
      }
    ],
    [
      "payments",
      "pay_seed_active_001",
      {
        id: "pay_seed_active_001",
        organizationId: orgId,
        lotId,
        plate: "PAY1234",
        normalizedPlate: "PAY1234",
        status: "active",
        paymentType: "hourly",
        source: "manual",
        validFrom: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() - 60 * 60 * 1000)
        ),
        validUntil: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 60 * 60 * 1000)
        ),
        payerName: "Seed Payer",
        payerReference: "seed-ref",
        notes: "Baseline payment",
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "permits",
      "permit_seed_active_001",
      {
        id: "permit_seed_active_001",
        organizationId: orgId,
        lotId,
        plate: "PERMIT1",
        normalizedPlate: "PERMIT1",
        status: "active",
        permitType: "allowlist",
        validFrom: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() - 24 * 60 * 60 * 1000)
        ),
        validUntil: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 24 * 60 * 60 * 1000)
        ),
        label: "Baseline permit",
        notes: "Baseline permit",
        createdAt: now,
        updatedAt: now,
        createdByUserId: "uid_admin_001"
      }
    ],
    [
      "systemConfig",
      "global",
      {
        environmentLabel: "Test",
        frontendBaseUrl: "http://127.0.0.1:5173",
        apiVersion: "v1",
        maintenanceModeEnabled: false,
        defaultPageSize: 25,
        defaultGracePeriodMinutes: 10,
        defaultDuplicateWindowSeconds: 120,
        createdAt: now,
        updatedAt: now
      }
    ]
  ];

  const batch = db.batch();
  for (const [collection, id, data] of docs) {
    batch.set(db.collection(collection).doc(id), data, { merge: true });
  }
  await batch.commit();
}

async function main() {
  await seedAuth();
  await seedFirestore();
  console.log("Emulator baseline seeded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
