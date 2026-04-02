import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { COLLECTIONS, ERROR_CODES } from "../config/constants";
import { env } from "../config/env";
import type { EventPayload, EventProcessResult, NormalizedEvent } from "../types/domain";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { normalizePlate, hashPayload } from "../utils/normalize";
import { AppError } from "../utils/errors";
import { makePrefixedId } from "../utils/id";

import { ID_PREFIX } from "../config/constants";

dayjs.extend(utc);
dayjs.extend(timezone);

interface ProcessOptions {
  actorUserId: string | null;
  via: "postman" | "unifi" | "manual";
  requestId: string;
}

interface ActiveRule {
  id: string;
  type: string;
  status: string;
  priority: number;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
}

function numberFromRule(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringArrayFromRule(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function isOutsideEnforcementHours(capturedAtIso: string, timezoneName: string, rules: ActiveRule[]) {
  const rule = rules.find((item) => item.type === "enforcement_hours");
  if (!rule) return false;

  const zoned = dayjs(capturedAtIso).tz(timezoneName);
  const hour = zoned.hour();
  const startHour = numberFromRule(
    rule.conditions?.startHour,
    rule.conditions?.startHourLocal,
    rule.actions?.startHour
  );
  const endHour = numberFromRule(
    rule.conditions?.endHour,
    rule.conditions?.endHourLocal,
    rule.actions?.endHour
  );

  if (startHour === null || endHour === null) return false;
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour < startHour || hour >= endHour;
  }
  return hour < startHour && hour >= endHour;
}

function evaluateGracePeriod(capturedAtIso: string, sessionOpenedAt: string | null, rules: ActiveRule[]) {
  const rule = rules.find((item) => item.type === "grace_period");
  if (!rule || !sessionOpenedAt) return false;

  const minutes = numberFromRule(
    rule.conditions?.minutes,
    rule.conditions?.graceMinutes,
    rule.actions?.minutes
  );

  if (minutes === null || minutes <= 0) return false;
  return dayjs(capturedAtIso).diff(dayjs(sessionOpenedAt), "minute", true) < minutes;
}

function resolveNotificationRoles(rules: ActiveRule[]) {
  const routingRule = rules.find((item) => item.type === "notification_routing");
  const roles = stringArrayFromRule(routingRule?.actions?.targetRoles || routingRule?.conditions?.targetRoles);
  return roles.length > 0 ? roles : null;
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

function isActiveWindowMatch(
  row: Record<string, unknown>,
  nowIso: string
) {
  const status = String(row.status || "");
  if (status !== "active") return false;

  const validFrom = typeof row.validFrom === "string" ? row.validFrom : null;
  const validUntil = typeof row.validUntil === "string" ? row.validUntil : null;

  if (validFrom && dayjs(validFrom).isValid() && dayjs(validFrom).isAfter(dayjs(nowIso))) {
    return false;
  }

  if (validUntil && dayjs(validUntil).isValid() && dayjs(validUntil).isBefore(dayjs(nowIso))) {
    return false;
  }

  return true;
}

function sortByIsoDesc<T extends Record<string, unknown>>(rows: T[], field: string) {
  return [...rows].sort((left, right) => String(right[field] || "").localeCompare(String(left[field] || "")));
}

function pickLatestOpenSession(rows: Array<Record<string, unknown>>) {
  return sortByIsoDesc(
    rows.filter((row) => String(row.status || "") === "open"),
    "openedAt"
  )[0] as { id: string; openedAt?: string } | undefined;
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

  const lot = await repo.getDoc<{ id: string; status: string; timezone?: string; duplicateWindowSecondsDefault?: number }>(
    COLLECTIONS.lots,
    source.lotId
  );
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

  const rules = await repo.listDocs<ActiveRule>(COLLECTIONS.rules, {
    filters: [
      ["lotId", "==", normalized.lotId],
      ["status", "==", "active"]
    ],
    orderBy: "priority",
    direction: "asc"
  });
  const duplicateWindowSeconds =
    numberFromRule(
      rules.find((rule) => rule.type === "duplicate_window")?.conditions?.seconds,
      rules.find((rule) => rule.type === "duplicate_window")?.conditions?.windowSeconds,
      rules.find((rule) => rule.type === "duplicate_window")?.actions?.seconds,
      lot.duplicateWindowSecondsDefault,
      env.defaultDuplicateWindowSeconds
    ) || env.defaultDuplicateWindowSeconds;

  const dedupeKey = dedupeKeyFor(source.id, payload, normalizedPlate);
  const lock = await repo.acquireProcessingLock(dedupeKey, payload.externalEventId || null, duplicateWindowSeconds);
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

    const paymentCandidates = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.payments, {
      filters: [
        ["lotId", "==", normalized.lotId],
        ["normalizedPlate", "==", normalizedPlate]
      ],
      limit: 20
    });
    const activePayments = sortByIsoDesc(
      paymentCandidates.filter((row) => isActiveWindowMatch(row, nowIso)),
      "validUntil"
    ).slice(0, 1) as Array<{ id: string }>;

    const permitCandidates = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.permits, {
      filters: [
        ["lotId", "==", normalized.lotId],
        ["normalizedPlate", "==", normalizedPlate]
      ],
      limit: 20
    });
    const activePermits = sortByIsoDesc(
      permitCandidates.filter((row) => isActiveWindowMatch(row, nowIso)),
      "validUntil"
    ).slice(0, 1) as Array<{ id: string }>;
    const previousByDedupe = await repo.listDocs<{ id: string; capturedAt: string; violationId?: string | null }>(
      COLLECTIONS.events,
      {
        filters: [["dedupeKey", "==", dedupeKey]],
        limit: 5
      }
    );

    const previous = sortByIsoDesc(previousByDedupe, "capturedAt").find((row) => row.id !== eventId) || null;
    const duplicate = Boolean(previous);

    const vehicleStateId = `veh_${normalized.lotId}_${normalizedPlate}`;
    const currentVehicle = await repo.getDoc<Record<string, unknown>>(COLLECTIONS.vehicleStates, vehicleStateId);

    let sessionId: string | null = null;
    let sessionOpenedAt: string | null = null;
    if (normalized.eventType === "entry" || normalized.sourceDirection === "entry") {
      const sessionCandidates = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.parkingSessions, {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["normalizedPlate", "==", normalizedPlate]
        ],
        limit: 20
      });
      const openSession = pickLatestOpenSession(sessionCandidates);

      if (openSession?.id) {
        sessionId = openSession.id;
        sessionOpenedAt = String(openSession.openedAt || normalized.capturedAt);
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
        sessionOpenedAt = normalized.capturedAt;
      }
    }

    if (normalized.eventType === "exit" || normalized.sourceDirection === "exit") {
      const sessionCandidates = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.parkingSessions, {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["normalizedPlate", "==", normalizedPlate]
        ],
        limit: 20
      });
      const openSession = pickLatestOpenSession(sessionCandidates);

      if (openSession?.id) {
        const opened = dayjs(String(openSession.openedAt || normalized.capturedAt));
        const durationMinutes = dayjs(normalized.capturedAt).diff(opened, "minute");
        await repo.updateDoc(COLLECTIONS.parkingSessions, openSession.id, {
          status: "closed",
          exitEventId: eventId,
          closedAt: normalized.capturedAt,
          sourceExitId: normalized.sourceId,
          durationMinutes,
          updatedAt: new Date().toISOString()
        });
        sessionId = openSession.id;
        sessionOpenedAt = String(openSession.openedAt || normalized.capturedAt);
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
    } else if (isOutsideEnforcementHours(normalized.capturedAt, lot.timezone || "America/New_York", rules)) {
      decisionStatus = "exempt";
      reasonCodes.push("outside_enforcement_hours");
    } else if (
      normalized.eventType !== "entry" &&
      normalized.sourceDirection !== "entry" &&
      evaluateGracePeriod(normalized.capturedAt, sessionOpenedAt, rules)
    ) {
      decisionStatus = "pending_review";
      reasonCodes.push("grace_period_active");
    } else {
      const pendingRule = rules.find(
        (rule) =>
          rule.actions?.markPending === true ||
          rule.conditions?.manualReview === true ||
          rule.actions?.createViolation === false
      );
      if (pendingRule) {
        decisionStatus = "pending_review";
        reasonCodes.push("manual_review_rule");
      } else {
        decisionStatus = "unpaid";
        reasonCodes.push("no_valid_payment_or_permit");
      }
    }

    let violationId: string | null = null;
    let createdViolationId: string | null = null;
    if (decisionStatus === "unpaid") {
      const existingOpenRows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.violations, {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["normalizedPlate", "==", normalizedPlate]
        ],
        limit: 20
      });
      const existingOpen = sortByIsoDesc(
        existingOpenRows.filter((row) => ["open", "acknowledged", "escalated"].includes(String(row.status || ""))),
        "createdAt"
      ) as Array<{ id: string }>;

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
        createdViolationId = violation.id;
      } else {
        violationId = existingOpen[0].id;
      }
    }

    const notificationIds: string[] = [];
    if (createdViolationId && !duplicate) {
      const accessRows = await repo.listDocs<{ userId: string; lotId: string; status: string; roleWithinLot?: string | null }>(
        COLLECTIONS.userLotAccess,
        {
        filters: [
          ["lotId", "==", normalized.lotId],
          ["status", "==", "active"]
        ]
      });
      const allowedRoles = resolveNotificationRoles(rules);

      for (const access of accessRows) {
        if (allowedRoles && !allowedRoles.includes(String(access.roleWithinLot || ""))) {
          continue;
        }
        const notification = await repo.createDoc("notifications", {
          organizationId: normalized.organizationId,
          lotId: normalized.lotId,
          targetUserId: access.userId,
          type: "violation_created",
          title: `Violation created for ${normalizedPlate}`,
          message: `Violation ${createdViolationId} opened from event ${eventId}`,
          severity: "high",
          isRead: false,
          readAt: null,
          linkedEntityType: "violation",
          linkedEntityId: createdViolationId
        });
        notificationIds.push(notification.id);
      }
    }

    if (sessionId && violationId) {
      await repo.updateDoc(COLLECTIONS.parkingSessions, sessionId, {
        openViolationId: violationId,
        updatedAt: new Date().toISOString()
      });
    }

    const currentOpenViolationId = violationId || (currentVehicle?.openViolationId as string | null) || null;

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
        openViolationId: currentOpenViolationId,
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
