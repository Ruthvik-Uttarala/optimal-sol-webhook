import assert from "node:assert/strict";
import request from "supertest";
import { buildApp } from "../app";
import { COLLECTIONS } from "../config/constants";
import { InMemoryRepository } from "../repositories/firestoreRepository";
import { processIncomingEvent } from "../services/eventProcessingService";
import type { EventPayload } from "../types/domain";

process.env.POSTMAN_CLIENT_SECRET = process.env.POSTMAN_CLIENT_SECRET || "test-secret";
process.env.INTERNAL_TEST_KEY = process.env.INTERNAL_TEST_KEY || "internal-test";
process.env.ALLOW_TEST_HEADERS = process.env.ALLOW_TEST_HEADERS || "true";

const adminHeader = {
  "x-test-user": JSON.stringify({ uid: "uid_admin_001", role: "admin" })
};

async function seedBaseData(repo: InMemoryRepository) {
  await repo.setDoc(COLLECTIONS.users, "uid_admin_001", {
    id: "uid_admin_001",
    globalRole: "admin",
    email: "admin@local.test",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.users, "uid_operator_001", {
    id: "uid_operator_001",
    globalRole: "operator",
    email: "operator@local.test",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.userLotAccess, "access_1", {
    id: "access_1",
    userId: "uid_admin_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    roleWithinLot: "admin",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.userLotAccess, "access_2", {
    id: "access_2",
    userId: "uid_operator_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    roleWithinLot: "operator",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.lots, "lot_demo_001", {
    id: "lot_demo_001",
    organizationId: "org_demo_001",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.lots, "lot_other_001", {
    id: "lot_other_001",
    organizationId: "org_other_001",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.sources, "src_postman_001", {
    id: "src_postman_001",
    organizationId: "org_demo_001",
    lotId: "lot_demo_001",
    sourceKey: "postman-main-gate-entry",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.sources, "src_other_001", {
    id: "src_other_001",
    organizationId: "org_other_001",
    lotId: "lot_other_001",
    sourceKey: "other-gate-entry",
    status: "active"
  });

  await repo.setDoc(COLLECTIONS.apiClients, "client_1", {
    id: "client_1",
    type: "postman",
    status: "active",
    secretHash: "9caf06bb4436cdbfa20af9121a626bc1093c4f54b31c0fa937957856135345b6",
    allowedRoutes: ["/api/v1/webhooks/postman/events"]
  });
}

function basePayload(overrides: Partial<EventPayload> = {}): EventPayload {
  return {
    sourceKey: "postman-main-gate-entry",
    externalEventId: "pm_evt_001",
    eventType: "entry",
    capturedAt: new Date().toISOString(),
    plate: "ABC1234",
    plateConfidence: 0.96,
    cameraLabel: "Entry Gate Camera",
    direction: "entry",
    metadata: { lane: "lane-1" },
    ...overrides
  };
}

async function runCase(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

async function main() {
  await runCase("rejects missing auth on /me", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    const app = buildApp(repo);
    const response = await request(app).get("/api/v1/me");
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "UNAUTHORIZED");
  });

  await runCase("blocks operator from admin-only route", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    const app = buildApp(repo);
    const response = await request(app)
      .post("/api/v1/rules")
      .set({
        "x-test-user": JSON.stringify({ uid: "uid_operator_001", role: "operator" })
      })
      .send({
        lotId: "lot_demo_001",
        name: "My Rule",
        description: "desc",
        type: "grace_period",
        status: "active",
        priority: 10,
        conditions: {},
        actions: {}
      });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });

  await runCase("returns scoped profile bootstrap for /me", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    const app = buildApp(repo);
    const response = await request(app).get("/api/v1/me").set(adminHeader);
    assert.equal(response.status, 200);
    assert.ok(response.body.data.accessContext);
    assert.deepEqual(response.body.data.accessContext.lotIds, ["lot_demo_001"]);
  });

  await runCase("rejects invalid webhook payload", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    const app = buildApp(repo);
    const response = await request(app)
      .post("/api/v1/webhooks/postman/events")
      .set("x-api-client-secret", "test-secret")
      .send({
        sourceKey: "postman-main-gate-entry",
        capturedAt: "invalid",
        plate: "ABC123"
      });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });

  await runCase("allows admin on admin-only route", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    const app = buildApp(repo);
    const response = await request(app)
      .post("/api/v1/rules")
      .set(adminHeader)
      .send({
        lotId: "lot_demo_001",
        name: "My Rule",
        description: "desc",
        type: "grace_period",
        status: "active",
        priority: 10,
        conditions: {},
        actions: {}
      });
    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
  });

  await runCase("blocks cross-lot event reads", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    await repo.setDoc(COLLECTIONS.events, "evt_other_001", {
      id: "evt_other_001",
      organizationId: "org_other_001",
      lotId: "lot_other_001",
      sourceId: "src_other_001",
      normalizedPlate: "OTHER1",
      plate: "OTHER1",
      capturedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      eventType: "entry",
      sourceDirection: "entry",
      processingStatus: "processed",
      decisionStatus: "paid"
    });

    const app = buildApp(repo);
    const response = await request(app).get("/api/v1/events/evt_other_001").set(adminHeader);
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });

  await runCase("blocks reading another user's notification", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    await repo.setDoc(COLLECTIONS.notifications, "noti_other_001", {
      id: "noti_other_001",
      organizationId: "org_demo_001",
      lotId: "lot_demo_001",
      targetUserId: "uid_other_001",
      type: "violation_created",
      title: "Other user notification",
      message: "Do not read",
      severity: "high",
      isRead: false,
      readAt: null,
      linkedEntityType: "violation",
      linkedEntityId: "vio_other_001"
    });

    const app = buildApp(repo);
    const response = await request(app).post("/api/v1/notifications/noti_other_001/read").set(adminHeader);
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });

  await runCase("prevents invalid violation state transitions", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    await repo.setDoc(COLLECTIONS.violations, "vio_demo_001", {
      id: "vio_demo_001",
      organizationId: "org_demo_001",
      lotId: "lot_demo_001",
      plate: "ABC1234",
      normalizedPlate: "ABC1234",
      status: "open",
      severity: "high",
      reasonCode: "UNPAID",
      reasonSummary: "No active payment or permit",
      triggerEventId: "evt_demo_001",
      vehicleStateId: null,
      parkingSessionId: null,
      evidenceRefs: [],
      assignedToUserId: null,
      acknowledgedAt: null,
      resolvedAt: null,
      dismissedAt: null,
      escalatedAt: null,
      resolutionNotes: null,
      dismissalReason: null,
      createdBySystem: true
    });

    const app = buildApp(repo);
    const first = await request(app).post("/api/v1/violations/vio_demo_001/resolve").set(adminHeader).send({
      reason: "resolved",
      notes: "manual resolution"
    });
    assert.equal(first.status, 200);

    const second = await request(app).post("/api/v1/violations/vio_demo_001/dismiss").set(adminHeader).send({
      reason: "false positive"
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, "VIOLATION_STATE_INVALID");
  });

  await runCase("marks paid when active payment exists", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    await repo.setDoc(COLLECTIONS.payments, "pay_001", {
      id: "pay_001",
      lotId: "lot_demo_001",
      normalizedPlate: "ABC1234",
      status: "active",
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validUntil: new Date(Date.now() + 60_000).toISOString()
    });
    const result = await processIncomingEvent(repo, basePayload(), {
      actorUserId: null,
      via: "postman",
      requestId: "req_test"
    });
    assert.equal(result.decisionStatus, "paid");
    assert.equal(result.violationId, null);
  });

  await runCase("marks exempt when active permit exists", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    await repo.setDoc(COLLECTIONS.permits, "permit_001", {
      id: "permit_001",
      lotId: "lot_demo_001",
      normalizedPlate: "ABC1234",
      status: "active"
    });
    const result = await processIncomingEvent(repo, basePayload(), {
      actorUserId: null,
      via: "postman",
      requestId: "req_test"
    });
    assert.equal(result.decisionStatus, "exempt");
    assert.equal(result.violationId, null);
  });

  await runCase("creates violation when unpaid", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    const result = await processIncomingEvent(repo, basePayload(), {
      actorUserId: null,
      via: "postman",
      requestId: "req_test"
    });
    assert.equal(result.decisionStatus, "unpaid");
    assert.ok(result.violationId);
    const violations = await repo.listDocs(COLLECTIONS.violations);
    assert.equal(violations.length, 1);
  });

  await runCase("suppresses duplicate event and avoids second open violation", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    const first = await processIncomingEvent(repo, basePayload({ externalEventId: "dup_evt" }), {
      actorUserId: null,
      via: "postman",
      requestId: "req_test_1"
    });
    const second = await processIncomingEvent(repo, basePayload({ externalEventId: "dup_evt" }), {
      actorUserId: null,
      via: "postman",
      requestId: "req_test_2"
    });
    assert.equal(first.decisionStatus, "unpaid");
    assert.equal(second.decisionStatus, "duplicate");
    const violations = await repo.listDocs(COLLECTIONS.violations);
    assert.equal(violations.length, 1);
  });

  await runCase("closes open session on exit", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    await processIncomingEvent(repo, basePayload({ externalEventId: "entry_1", eventType: "entry", direction: "entry" }), {
      actorUserId: null,
      via: "postman",
      requestId: "req_test_1"
    });
    const exitResult = await processIncomingEvent(
      repo,
      basePayload({ externalEventId: "exit_1", eventType: "exit", direction: "exit" }),
      {
        actorUserId: null,
        via: "postman",
        requestId: "req_test_2"
      }
    );
    assert.ok(exitResult.eventId);
    const sessions = await repo.listDocs<{ status: string }>(COLLECTIONS.parkingSessions);
    assert.ok(sessions.some((row) => row.status === "closed"));
  });

  await runCase("rejects invalid payload timestamp", async () => {
    const repo = new InMemoryRepository();
    await seedBaseData(repo);
    await assert.rejects(
      processIncomingEvent(repo, basePayload({ capturedAt: "invalid-date" }), {
        actorUserId: null,
        via: "postman",
        requestId: "req_test"
      })
    );
  });

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
}

void main();

