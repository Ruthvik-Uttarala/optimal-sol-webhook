import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { COLLECTIONS, ERROR_CODES } from "../config/constants";
import { env } from "../config/env";
import type { EventPayload, EventProcessResult, NormalizedEvent } from "../types/domain";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { normalizePlate, hashPayload } from "../utils/normalize";
import { AppError } from "../utils/errors";
import { makePrefixedId } from "../utils/id";

import { ID_PREFIX } from "../config/constants";

dayjs.extend(utc);

interface ProcessOptions {
  actorUserId: string | null;
  via: "postman" | "unifi" | "manual";
  requestId: string;
}

function toIso(value: string): string {
  const d = dayjs(value);
  if (!d.isValid()) {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "capturedAt must be a valid ISO datetime");
  }
  return d.toISOString();
}

function dedupeKeyFor(sourceId: string, payload: EventPayload, normalizedPlate: string): string {
  const minute = dayjs(payload.capturedAt).utc().format("YYYY-MM-DDTHH:mm");
  const external = payload.externalEventId || "na";
  const direction = payload.direction || payload.eventType || "unknown";
  return `${sourceId}|${external}|${normalizedPlate}|${direction}|${minute}`;
}

export async function processIncomingEvent(
  repo: IDataRepository,
  payload: EventPayload,
  options: ProcessOptions
): Promise<EventProcessResult> {
  const receivedAtIso = new Date().toISOString();
  const normalizedPlate = normalizePlate(payload.plate);
  const capturedAtIso = toIso(payload.capturedAt);

  const sources = await repo.listDocs<{ id: string; sourceKey: string; status: string; lotId: string; organizationId: string }>(
    COLLECTIONS.sources,
    {
      filters: [
        ["sourceKey", "==", payload.sourceKey],
        ["status", "==", "active"]
      ],
      limit: 1
    }
  );

  const source = sources[0];
  if (!source) {
    throw new AppError(404, ERROR_CODES.SOURCE_INACTIVE, "Source key not active");
  }

  const lot = await repo.getDoc<{ id: string; status: string }>(COLLECTIONS.lots, source.lotId);
  if (!lot || lot.status !== "active") {
    throw new AppError(404, ERROR_CODES.LOT_INACTIVE, "Lot not active");
  }

  const normalized: NormalizedEvent = {
    organizationId: source.organizationId,
    lotId: source.lotId,
    sourceId: source.id,
    externalEventId: payload.externalEventId || null,
    eventType: payload.eventType || "unknown",
    sourceDirection: payload.direction || "unknown",
    plate: payload.plate,
    normalizedPlate,
    plateConfidence: payload.plateConfidence ?? null,
    capturedAt: capturedAtIso,
    receivedAt: receivedAtIso,
    isTestEvent: options.via !== "unifi"
  };

  const dedupeKey = dedupeKeyFor(source.id, payload, normalizedPlate);
  const lock = await repo.acquireProcessingLock(dedupeKey, payload.externalEventId || null, env.defaultDuplicateWindowSeconds);
  if (!lock.acquired) {
    throw new AppError(409, ERROR_CODES.PROCESSING_LOCK_EXISTS, "Processing lock already exists");
  }

  const eventId = makePrefixedId(ID_PREFIX.events);

  try {
    await repo.setDoc(
      COLLECTIONS.events,
      eventId,
      {
        id: eventId,
        organizationId: normalized.organizationId,
        lotId: normalized.lotId,
        sourceId: normalized.sourceId,
        externalEventId: normalized.externalEventId,
        rawPayloadHash: hashPayload(payload),
        rawPayload: payload,
        eventType: normalized.eventType,
        sourceDirection: normalized.sourceDirection,
        plate: payload.plate,
        normalizedPlate,
        plateConfidence: normalized.plateConfidence,
        capturedAt: normalized.capturedAt,
        receivedAt: normalized.receivedAt,
        processedAt: null,
        processingStatus: "received",
        decisionStatus: "pending_review",
        decisionReasonCodes: [],
        activePaymentId: null,
        activePermitId: null,
        vehicleStateId: null,
        parkingSessionId: null,
        violationId: null,
        notificationIds: [],
        dedupeKey,
        isTestEvent: normalized.isTestEvent,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      true
    );

    const nowIso = normalized.capturedAt;

    const activePayments = await repo.listDocs<{ id: string }>(COLLECTIONS.payments, {
      filters: [
        ["lotId", "==", normalized.lotId],
        ["normalizedPlate", "==", normalizedPlate],
        ["status", "==", "active"],
        ["validFrom", "<=", nowIso],
        ["validUntil", ">=", nowIso]
      ],
      orderBy: "validUntil",
      direction: "desc",
      limit: 1
    });

    const activePermits = await repo.listDocs<{ id: string }>(COLLECTIONS.permits, {
      filters: [
        ["lotId", "==", normalized.lotId],
        ["normalizedPlate", "==", normalizedPlate],
        ["status", "==", "active"]
      ],
      limit: 1
    });

    const rules = await repo.listDocs<{ id: string; type: string; status: string; priority: number; conditions?: Record<string, unknown>; actions?: Record<string, unknown> }>(
      COLLECTIONS.rules,
      {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["status", "==", "active"]
        ],
        orderBy: "priority",
        direction: "asc"
      }
    );

    const previousByDedupe = await repo.listDocs<{ id: string; capturedAt: string; violationId?: string | null }>(
      COLLECTIONS.events,
      {
        filters: [["dedupeKey", "==", dedupeKey]],
        orderBy: "capturedAt",
        direction: "desc",
        limit: 2
      }
    );

    const previous = previousByDedupe.find((row) => row.id !== eventId) || null;
    const duplicate = Boolean(previous);

    const vehicleStateId = `veh_${normalized.lotId}_${normalizedPlate}`;
    const currentVehicle = await repo.getDoc<Record<string, unknown>>(COLLECTIONS.vehicleStates, vehicleStateId);

    let sessionId: string | null = null;
    if (normalized.eventType === "entry" || normalized.sourceDirection === "entry") {
      const openSessions = await repo.listDocs<{ id: string }>(COLLECTIONS.parkingSessions, {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["normalizedPlate", "==", normalizedPlate],
          ["status", "==", "open"]
        ],
        orderBy: "openedAt",
        direction: "desc",
        limit: 1
      });

      if (openSessions.length > 0) {
        sessionId = openSessions[0].id;
      } else {
        const createdSession = await repo.createDoc("parkingSessions", {
          organizationId: normalized.organizationId,
          lotId: normalized.lotId,
          plate: normalized.plate,
          normalizedPlate,
          status: "open",
          entryEventId: eventId,
          exitEventId: null,
          openedAt: normalized.capturedAt,
          closedAt: null,
          sourceEntryId: normalized.sourceId,
          sourceExitId: null,
          linkedPaymentId: activePayments[0]?.id || null,
          linkedPermitId: activePermits[0]?.id || null,
          openViolationId: null,
          durationMinutes: null
        });
        sessionId = createdSession.id;
      }
    }

    if (normalized.eventType === "exit" || normalized.sourceDirection === "exit") {
      const openSessions = await repo.listDocs<{ id: string; openedAt: string }>(COLLECTIONS.parkingSessions, {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["normalizedPlate", "==", normalizedPlate],
          ["status", "==", "open"]
        ],
        orderBy: "openedAt",
        direction: "desc",
        limit: 1
      });

      if (openSessions[0]) {
        const opened = dayjs(openSessions[0].openedAt);
        const durationMinutes = dayjs(normalized.capturedAt).diff(opened, "minute");
        await repo.updateDoc(COLLECTIONS.parkingSessions, openSessions[0].id, {
          status: "closed",
          exitEventId: eventId,
          closedAt: normalized.capturedAt,
          sourceExitId: normalized.sourceId,
          durationMinutes,
          updatedAt: new Date().toISOString()
        });
        sessionId = openSessions[0].id;
      }
    }

    let decisionStatus: EventProcessResult["decisionStatus"] = "pending_review";
    const reasonCodes: string[] = [];

    if (duplicate) {
      decisionStatus = "duplicate";
      reasonCodes.push("duplicate_suppressed");
    } else if (activePermits.length > 0) {
      decisionStatus = "exempt";
      reasonCodes.push("permit_active");
    } else if (activePayments.length > 0) {
      decisionStatus = "paid";
      reasonCodes.push("payment_active");
    } else {
      const pendingRule = rules.find((rule) => rule.actions?.markPending === true || rule.conditions?.manualReview === true);
      if (pendingRule) {
        decisionStatus = "pending_review";
        reasonCodes.push("manual_review_rule");
      } else {
        decisionStatus = "unpaid";
        reasonCodes.push("no_valid_payment_or_permit");
      }
    }

    let violationId: string | null = null;
    if (decisionStatus === "unpaid") {
      const existingOpen = await repo.listDocs<{ id: string }>(COLLECTIONS.violations, {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["normalizedPlate", "==", normalizedPlate],
          ["status", "in", ["open", "acknowledged", "escalated"]]
        ],
        orderBy: "createdAt",
        direction: "desc",
        limit: 1
      });

      if (!existingOpen[0]) {
        const violation = await repo.createDoc("violations", {
          organizationId: normalized.organizationId,
          lotId: normalized.lotId,
          plate: normalized.plate,
          normalizedPlate,
          status: "open",
          severity: "high",
          reasonCode: "UNPAID",
          reasonSummary: "No active payment or permit",
          triggerEventId: eventId,
          vehicleStateId,
          parkingSessionId: sessionId,
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
        violationId = violation.id;
      }
    }

    const notificationIds: string[] = [];
    if (violationId) {
      const accessRows = await repo.listDocs<{ userId: string; lotId: string; status: string }>(COLLECTIONS.userLotAccess, {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["status", "==", "active"]
        ]
      });

      for (const access of accessRows) {
        const notification = await repo.createDoc("notifications", {
          organizationId: normalized.organizationId,
          lotId: normalized.lotId,
          targetUserId: access.userId,
          type: "violation_created",
          title: `Violation created for ${normalizedPlate}`,
          message: `Violation ${violationId} opened from event ${eventId}`,
          severity: "high",
          isRead: false,
          readAt: null,
          linkedEntityType: "violation",
          linkedEntityId: violationId
        });
        notificationIds.push(notification.id);
      }
    }

    await repo.setDoc(
      COLLECTIONS.vehicleStates,
      vehicleStateId,
      {
        id: vehicleStateId,
        organizationId: normalized.organizationId,
        lotId: normalized.lotId,
        plate: normalized.plate,
        normalizedPlate,
        currentStatus:
          decisionStatus === "duplicate"
            ? currentVehicle?.currentStatus || "unknown"
            : decisionStatus === "unpaid"
              ? "unpaid"
              : decisionStatus === "paid"
                ? "paid"
                : decisionStatus === "exempt"
                  ? "exempt"
                  : "pending_review",
        presenceStatus:
          normalized.eventType === "exit" || normalized.sourceDirection === "exit"
            ? "out_of_lot"
            : normalized.eventType === "entry" || normalized.sourceDirection === "entry"
              ? "in_lot"
              : currentVehicle?.presenceStatus || "unknown",
        currentPaymentId: activePayments[0]?.id || null,
        currentPermitId: activePermits[0]?.id || null,
        openViolationId: violationId,
        lastEventId: eventId,
        lastSeenAt: normalized.capturedAt,
        lastEntryAt:
          normalized.eventType === "entry" || normalized.sourceDirection === "entry"
            ? normalized.capturedAt
            : (currentVehicle?.lastEntryAt as string | null) || null,
        lastExitAt:
          normalized.eventType === "exit" || normalized.sourceDirection === "exit"
            ? normalized.capturedAt
            : (currentVehicle?.lastExitAt as string | null) || null,
        lastSourceId: normalized.sourceId,
        duplicateCountRecent: duplicate ? ((currentVehicle?.duplicateCountRecent as number) || 0) + 1 : currentVehicle?.duplicateCountRecent || 0,
        flags: (currentVehicle?.flags as string[]) || [],
        notesSummary: (currentVehicle?.notesSummary as string | null) || null,
        createdAt: currentVehicle?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      true
    );

    const processingStatus: EventProcessResult["processingStatus"] = duplicate ? "duplicate_suppressed" : "processed";

    await repo.updateDoc(COLLECTIONS.events, eventId, {
      processedAt: new Date().toISOString(),
      processingStatus,
      decisionStatus,
      decisionReasonCodes: reasonCodes,
      activePaymentId: activePayments[0]?.id || null,
      activePermitId: activePermits[0]?.id || null,
      vehicleStateId,
      parkingSessionId: sessionId,
      violationId,
      notificationIds,
      updatedAt: new Date().toISOString()
    });

    await repo.createAuditLog({
      organizationId: normalized.organizationId,
      lotId: normalized.lotId,
      actorType: options.actorUserId ? "user" : "system",
      actorUserId: options.actorUserId,
      actionType: duplicate ? "duplicate_event_suppressed" : "event_ingested",
      entityType: "event",
      entityId: eventId,
      summary: `Event processed (${decisionStatus})`,
      beforeSnapshot: null,
      afterSnapshot: {
        decisionStatus,
        processingStatus,
        violationId,
        notificationIds
      },
      requestId: options.requestId,
      createdAt: new Date().toISOString()
    });

    await repo.releaseProcessingLock(lock.lockId, "completed");

    return {
      eventId,
      decisionStatus,
      processingStatus,
      violationId,
      notificationIds,
      reasonCodes
    };
  } catch (error) {
    await repo.updateDoc(COLLECTIONS.events, eventId, {
      processingStatus: "failed",
      decisionStatus: "error",
      errorCode: error instanceof AppError ? error.code : ERROR_CODES.INTERNAL_ERROR,
      errorMessage: error instanceof Error ? error.message : "Unknown processing error",
      updatedAt: new Date().toISOString()
    });

    await repo.releaseProcessingLock(lock.lockId, "failed");

    await repo.createAuditLog({
      organizationId: normalized.organizationId,
      lotId: normalized.lotId,
      actorType: options.actorUserId ? "user" : "system",
      actorUserId: options.actorUserId,
      actionType: "event_ingest_failed",
      entityType: "event",
      entityId: eventId,
      summary: "Event processing failed",
      beforeSnapshot: null,
      afterSnapshot: {
        error: error instanceof Error ? error.message : "Unknown"
      },
      requestId: options.requestId,
      createdAt: new Date().toISOString()
    });

    throw error;
  }
}

export async function reprocessEvent(repo: IDataRepository, eventId: string, requestId: string, actorUserId: string | null): Promise<EventProcessResult> {
  const event = await repo.getDoc<{ rawPayload?: EventPayload; sourceId?: string; sourceKey?: string }>(COLLECTIONS.events, eventId);
  if (!event?.rawPayload) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
  }

  const payload = event.rawPayload;
  return processIncomingEvent(repo, payload, {
    actorUserId,
    via: "manual",
    requestId
  });
}
