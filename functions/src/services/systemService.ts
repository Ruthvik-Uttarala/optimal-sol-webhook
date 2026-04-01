import dayjs from "dayjs";
import { COLLECTIONS, SYSTEM_CONFIG_DOC } from "../config/constants";
import type { IDataRepository } from "../repositories/firestoreRepository";

type QueryFilter = [string, FirebaseFirestore.WhereFilterOp, unknown];

function uniqueLotIds(lotIds: string[]) {
  return [...new Set(lotIds.filter(Boolean))];
}

async function countAcrossLots(repo: IDataRepository, collection: string, lotIds: string[], filters: QueryFilter[] = []) {
  const scoped = uniqueLotIds(lotIds);
  if (scoped.length === 0) {
    return repo.countDocs(collection, filters);
  }

  const counts = await Promise.all(
    scoped.map((lotId) => repo.countDocs(collection, [...filters, ["lotId", "==", lotId]]))
  );

  return counts.reduce((sum, value) => sum + value, 0);
}

async function listAcrossLots<T extends Record<string, unknown>>(
  repo: IDataRepository,
  collection: string,
  lotIds: string[],
  options: {
    filters?: QueryFilter[];
    orderBy?: string;
    direction?: "asc" | "desc";
    limit?: number;
  } = {}
) {
  const scoped = uniqueLotIds(lotIds);
  if (scoped.length === 0) {
    return repo.listDocs<T>(collection, options);
  }

  const perLotLimit = Math.max(options.limit || 1, 25);
  const rows = await Promise.all(
    scoped.map((lotId) =>
      repo.listDocs<T>(collection, {
        ...options,
        filters: [...(options.filters || []), ["lotId", "==", lotId]],
        limit: perLotLimit
      })
    )
  );

  return rows
    .flat()
    .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
      const field = options.orderBy || "updatedAt";
      const leftValue = String(left[field] || "");
      const rightValue = String(right[field] || "");
      return options.direction === "asc" ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
    })
    .slice(0, options.limit || rows.flat().length) as T[];
}

function buildScopedAccessContext(lotIds: string[]) {
  return {
    role: lotIds.length ? "admin" : "super_admin",
    uid: "",
    email: null,
    lotIds,
    organizationIds: []
  } as const;
}

export async function getSystemStatus(repo: IDataRepository, lotIds: string[] = []) {
  const [lastEvent] = await listAcrossLots<{
    id: string;
    processedAt?: string;
    processingStatus?: string;
    capturedAt?: string;
    decisionStatus?: string;
    sourceId?: string;
    lotId?: string;
  }>(repo, COLLECTIONS.events, lotIds, {
    orderBy: "capturedAt",
    direction: "desc",
    limit: 1
  });

  const [lastSuccess] = await listAcrossLots<{ id: string; processedAt?: string; capturedAt?: string }>(repo, COLLECTIONS.events, lotIds, {
    filters: [["processingStatus", "==", "processed"]],
    orderBy: "processedAt",
    direction: "desc",
    limit: 1
  });

  const [lastFailure] = await listAcrossLots<{ id: string; processedAt?: string; capturedAt?: string; errorCode?: string; errorMessage?: string }>(
    repo,
    COLLECTIONS.events,
    lotIds,
    {
      filters: [["processingStatus", "==", "failed"]],
      orderBy: "processedAt",
      direction: "desc",
      limit: 1
    }
  );

  const [activeSourceCount, unreadNotificationCount] = await Promise.all([
    countAcrossLots(repo, COLLECTIONS.sources, lotIds, [["status", "==", "active"]]),
    countAcrossLots(repo, COLLECTIONS.notifications, lotIds, [["isRead", "==", false]])
  ]);

  return {
    healthy: !lastFailure || Boolean(lastSuccess && (!lastFailure.processedAt || (lastSuccess.processedAt || "") >= lastFailure.processedAt)),
    backendHealth: "ok",
    lastEventReceived: lastEvent?.capturedAt || null,
    lastEventId: lastEvent?.id || null,
    lastEventDecision: lastEvent?.decisionStatus || null,
    lastSuccessfulProcessingTime: lastSuccess?.processedAt || null,
    lastFailedProcessingTime: lastFailure?.processedAt || null,
    lastFailureCode: lastFailure?.errorCode || null,
    lastFailureMessage: lastFailure?.errorMessage || null,
    firestoreState: "connected",
    notificationState: "connected",
    deploymentEnvironment: process.env.ENV_LABEL || "Test",
    eventSourceMode: process.env.ALLOW_TEST_HEADERS === "true" ? "Test/Postman" : "Production",
    activeSourceCount,
    unreadNotificationCount,
    scopeMode: lotIds.length ? "lot_scoped" : "global",
    scopedLotCount: uniqueLotIds(lotIds).length
  };
}

export async function getSystemConfig(repo: IDataRepository) {
  return (
    (await repo.getDoc<Record<string, unknown>>(COLLECTIONS.systemConfig, SYSTEM_CONFIG_DOC)) || {
      environmentLabel: process.env.ENV_LABEL || "Test",
      apiVersion: "v1"
    }
  );
}

export async function getSystemMetrics(repo: IDataRepository, lotIds: string[] = []) {
  const dayStart = dayjs().startOf("day").toISOString();
  const scopedLotIds = uniqueLotIds(lotIds);
  const scope = buildScopedAccessContext(scopedLotIds);

  const [eventsToday, openViolations, vehiclesInLot, unreadAlerts, processingFailures, unpaidVehicles] = await Promise.all([
    countAcrossLots(repo, COLLECTIONS.events, scopedLotIds, [["capturedAt", ">=", dayStart]]),
    countAcrossLots(repo, COLLECTIONS.violations, scopedLotIds, [["status", "in", ["open", "acknowledged", "escalated"]]]),
    countAcrossLots(repo, COLLECTIONS.vehicleStates, scopedLotIds, [["presenceStatus", "==", "in_lot"]]),
    countAcrossLots(repo, COLLECTIONS.notifications, scopedLotIds, [["isRead", "==", false]]),
    countAcrossLots(repo, COLLECTIONS.events, scopedLotIds, [
      ["capturedAt", ">=", dayStart],
      ["processingStatus", "==", "failed"]
    ]),
    countAcrossLots(repo, COLLECTIONS.vehicleStates, scopedLotIds, [["currentStatus", "==", "unpaid"]])
  ]);

  return {
    eventsToday,
    activeOpenViolations: openViolations,
    vehiclesCurrentlyInLot: vehiclesInLot,
    unreadAlerts,
    processingFailureCount: processingFailures,
    processingSuccess: Math.max(eventsToday - processingFailures, 0),
    unpaidVehiclesNeedingAttention: unpaidVehicles,
    scopeMode: scope.role,
    lotCount: scopedLotIds.length
  };
}
