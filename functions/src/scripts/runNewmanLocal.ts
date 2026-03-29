import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { buildApp } from "../app";
import { InMemoryRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { hashSecret } from "../utils/normalize";

const repoRoot = path.resolve(__dirname, "../../..");
const collectionPath = path.resolve(repoRoot, "postman/ParkingSol.postman_collection.json");
const environmentPath = path.resolve(repoRoot, "postman/ParkingSol.postman_environment.json");

async function seed(repo: InMemoryRepository): Promise<void> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const hourAgoIso = new Date(now - 60 * 60 * 1000).toISOString();
  const hourAheadIso = new Date(now + 60 * 60 * 1000).toISOString();
  const dayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const dayAheadIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  await repo.setDoc(COLLECTIONS.organizations, "org_demo_001", {
    id: "org_demo_001",
    name: "ParkingSol Demo Org",
    status: "active",
    timezone: "America/New_York",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.lots, "lot_demo_001", {
    id: "lot_demo_001",
    organizationId: "org_demo_001",
    name: "Main Demo Lot",
    status: "active",
    timezone: "America/New_York",
    testModeEnabled: true,
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.users, "uid_admin_001", {
    id: "uid_admin_001",
    email: "admin@parkingsol.local",
    displayName: "Admin User",
    globalRole: "admin",
    status: "active",
    defaultLotId: "lot_demo_001",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.users, "uid_operator_001", {
    id: "uid_operator_001",
    email: "operator@parkingsol.local",
    displayName: "Operator User",
    globalRole: "operator",
    status: "active",
    defaultLotId: "lot_demo_001",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.users, "uid_support_001", {
    id: "uid_support_001",
    email: "support@parkingsol.local",
    displayName: "Support User",
    globalRole: "support",
    status: "active",
    defaultLotId: "lot_demo_001",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.userLotAccess, "access_uid_admin_001_lot_demo_001", {
    id: "access_uid_admin_001_lot_demo_001",
    userId: "uid_admin_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    roleWithinLot: "admin",
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.userLotAccess, "access_uid_operator_001_lot_demo_001", {
    id: "access_uid_operator_001_lot_demo_001",
    userId: "uid_operator_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    roleWithinLot: "operator",
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.userLotAccess, "access_uid_support_001_lot_demo_001", {
    id: "access_uid_support_001_lot_demo_001",
    userId: "uid_support_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    roleWithinLot: "support",
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.sources, "src_postman_001", {
    id: "src_postman_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    sourceKey: "postman-main-gate-entry",
    type: "postman",
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.apiClients, "client_postman_001", {
    id: "client_postman_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    name: "Postman Local Client",
    type: "postman",
    status: "active",
    secretHash: hashSecret("change-me"),
    allowedRoutes: ["/api/v1/webhooks/postman/events"],
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.rules, "rule_default_grace_001", {
    id: "rule_default_grace_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    name: "Default Grace",
    type: "grace_period",
    status: "active",
    priority: 10,
    conditions: { minutes: 10 },
    actions: { allow: true },
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.payments, "pay_seed_active_001", {
    id: "pay_seed_active_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    plate: "PAY1234",
    normalizedPlate: "PAY1234",
    status: "active",
    validFrom: hourAgoIso,
    validUntil: hourAheadIso,
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.permits, "permit_seed_active_001", {
    id: "permit_seed_active_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    plate: "PERMIT1",
    normalizedPlate: "PERMIT1",
    status: "active",
    validFrom: dayAgoIso,
    validUntil: dayAheadIso,
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await repo.setDoc(COLLECTIONS.systemConfig, "global", {
    id: "global",
    environmentLabel: "Test",
    createdAt: nowIso,
    updatedAt: nowIso
  });
}

async function main(): Promise<void> {
  process.env.ALLOW_TEST_HEADERS = "true";
  process.env.POSTMAN_CLIENT_SECRET = "change-me";
  process.env.INTERNAL_TEST_KEY = process.env.INTERNAL_TEST_KEY || "internal-test";

  const repo = new InMemoryRepository();
  await seed(repo);

  const app = buildApp(repo);
  const wrapped = express();
  wrapped.use("/parking-sol-local/us-central1/api", app);

  const server = wrapped.listen(5001, "127.0.0.1", () => {
    const newman = spawn(
      "newman",
      [
        "run",
        collectionPath,
        "-e",
        environmentPath
      ],
      { stdio: "inherit", shell: true }
    );

    newman.on("exit", (code) => {
      server.close(() => {
        process.exit(code ?? 1);
      });
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
