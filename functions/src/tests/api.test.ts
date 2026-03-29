import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { InMemoryRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";

const adminHeader = {
  "x-test-user": JSON.stringify({ uid: "uid_admin_001", role: "admin" })
};

const operatorHeader = {
  "x-test-user": JSON.stringify({ uid: "uid_operator_001", role: "operator" })
};

describe("api auth and route guards", () => {
  let repo: InMemoryRepository;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env.POSTMAN_CLIENT_SECRET = "test-secret";
    process.env.INTERNAL_TEST_KEY = "internal-test";
    process.env.ALLOW_TEST_HEADERS = "true";

    repo = new InMemoryRepository();
    app = buildApp(repo);

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

    await repo.setDoc(COLLECTIONS.sources, "src_postman_001", {
      id: "src_postman_001",
      organizationId: "org_demo_001",
      lotId: "lot_demo_001",
      sourceKey: "postman-main-gate-entry",
      status: "active"
    });

    await repo.setDoc(COLLECTIONS.lots, "lot_other_001", {
      id: "lot_other_001",
      organizationId: "org_other_001",
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
  });

  it("rejects missing auth on protected route", async () => {
    const response = await request(app).get("/api/v1/me");
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("blocks operator from admin-only route", async () => {
    const response = await request(app)
      .post("/api/v1/rules")
      .set(operatorHeader)
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

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects invalid payload", async () => {
    const response = await request(app)
      .post("/api/v1/webhooks/postman/events")
      .set("x-api-client-secret", "test-secret")
      .send({
        sourceKey: "postman-main-gate-entry",
        capturedAt: "invalid",
        plate: "ABC123"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("allows admin on admin-only route", async () => {
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

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("returns scoped profile bootstrap for /me", async () => {
    const response = await request(app).get("/api/v1/me").set(adminHeader);
    expect(response.status).toBe(200);
    expect(response.body.data.accessContext).toBeTruthy();
    expect(response.body.data.accessContext.lotIds).toContain("lot_demo_001");
  });

  it("blocks cross-lot event reads", async () => {
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

    const response = await request(app).get("/api/v1/events/evt_other_001").set(adminHeader);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("blocks reading another user's notification", async () => {
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

    const response = await request(app).post("/api/v1/notifications/noti_other_001/read").set(adminHeader);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents invalid violation state transitions", async () => {
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

    const first = await request(app).post("/api/v1/violations/vio_demo_001/resolve").set(adminHeader).send({
      reason: "resolved",
      notes: "manual resolution"
    });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/v1/violations/vio_demo_001/dismiss").set(adminHeader).send({
      reason: "false positive"
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("VIOLATION_STATE_INVALID");
  });
});
