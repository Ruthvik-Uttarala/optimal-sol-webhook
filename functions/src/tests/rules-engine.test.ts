import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryRepository } from "../repositories/firestoreRepository";
import { processIncomingEvent } from "../services/eventProcessingService";
import { COLLECTIONS } from "../config/constants";
import type { EventPayload } from "../types/domain";

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

describe("event processing rules", () => {
  let repo: InMemoryRepository;

  beforeEach(async () => {
    repo = new InMemoryRepository();
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
  });

  it("marks paid when active payment exists", async () => {
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

    expect(result.decisionStatus).toBe("paid");
    expect(result.violationId).toBeNull();
  });

  it("marks exempt when active permit exists", async () => {
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

    expect(result.decisionStatus).toBe("exempt");
    expect(result.violationId).toBeNull();
  });

  it("creates violation when unpaid", async () => {
    const result = await processIncomingEvent(repo, basePayload(), {
      actorUserId: null,
      via: "postman",
      requestId: "req_test"
    });

    expect(result.decisionStatus).toBe("unpaid");
    expect(result.violationId).toBeTruthy();
    const violations = await repo.listDocs(COLLECTIONS.violations);
    expect(violations.length).toBe(1);
  });

  it("suppresses duplicate event and avoids second open violation", async () => {
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

    expect(first.decisionStatus).toBe("unpaid");
    expect(second.decisionStatus).toBe("duplicate");
    const violations = await repo.listDocs(COLLECTIONS.violations);
    expect(violations.length).toBe(1);
  });

  it("closes open session on exit", async () => {
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

    expect(exitResult.eventId).toBeTruthy();
    const sessions = await repo.listDocs<{ status: string }>(COLLECTIONS.parkingSessions);
    expect(sessions.some((row) => row.status === "closed")).toBe(true);
  });

  it("rejects invalid payload timestamp", async () => {
    await expect(
      processIncomingEvent(repo, basePayload({ capturedAt: "invalid-date" }), {
        actorUserId: null,
        via: "postman",
        requestId: "req_test"
      })
    ).rejects.toThrow();
  });
});
