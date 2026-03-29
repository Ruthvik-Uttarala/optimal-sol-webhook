import dayjs from "dayjs";
import { COLLECTIONS, SYSTEM_CONFIG_DOC } from "../config/constants";
import type { IDataRepository } from "../repositories/firestoreRepository";

function buildLotFilters(lotIds: string[]) {
  if (lotIds.length === 0) return [];
  if (lotIds.length === 1) return [["lotId", "==", lotIds[0]] as const];
  if (lotIds.length <= 10) return [["lotId", "in", lotIds] as const];
  return [];
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

export async function getSystemStatus(repo: IDataRepository) {
  const [lastEvent] = await repo.listDocs<{
    id: string;
    processedAt?: string;
    processingStatus?: string;
    capturedAt?: string;
    decisionStatus?: string;
    sourceId?: string;
    lotId?: string;
  }>(COLLECTIONS.events, {
    orderBy: "capturedAt",
    direction: "desc",
    limit: 1
  });

  const [lastSuccess] = await repo.listDocs<{ id: string; processedAt?: string; capturedAt?: string }>(COLLECTIONS.events, {
    filters: [["processingStatus", "==", "processed"]],
    orderBy: "processedAt",
    direction: "desc",
    limit: 1
  });

  const [lastFailure] = await repo.listDocs<{ id: string; processedAt?: string; capturedAt?: string; errorCode?: string; errorMessage?: string }>(COLLECTIONS.events, {
    filters: [["processingStatus", "==", "failed"]],
    orderBy: "processedAt",
    direction: "desc",
    limit: 1
  });

  const [activeSourceCount, unreadNotificationCount] = await Promise.all([
    repo.countDocs(COLLECTIONS.sources, [["status", "==", "active"]]),
    repo.countDocs(COLLECTIONS.notifications, [["isRead", "==", false]])
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
    unreadNotificationCount
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
  const filters = buildLotFilters(lotIds);
  const scope = buildScopedAccessContext(lotIds);

  const [eventsToday, openViolations, vehiclesInLot, unreadAlerts, processingFailures, unpaidVehicles] = await Promise.all([
    repo.countDocs(COLLECTIONS.events, [...(filters as never), ["capturedAt", ">=", dayStart]] as never),
    repo.countDocs(COLLECTIONS.violations, [...(filters as never), ["status", "in", ["open", "acknowledged", "escalated"]]] as never),
    repo.countDocs(COLLECTIONS.vehicleStates, [...(filters as never), ["presenceStatus", "==", "in_lot"]] as never),
    repo.countDocs(COLLECTIONS.notifications, [["isRead", "==", false]]),
    repo.countDocs(COLLECTIONS.events, [...(filters as never), ["capturedAt", ">=", dayStart], ["processingStatus", "==", "failed"]] as never),
    repo.countDocs(COLLECTIONS.vehicleStates, [...(filters as never), ["currentStatus", "==", "unpaid"]] as never)
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
    lotCount: lotIds.length
  };
}

