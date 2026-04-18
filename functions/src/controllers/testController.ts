import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { normalizePlate } from "../utils/normalize";
import { makePrefixedId } from "../utils/id";
import { sendSuccess } from "../utils/response";

function matchesCleanupScope(
  row: Record<string, unknown>,
  criteria: { demoSessionId: string | null; sourceId: string | null; sourceKey: string | null; plates: string[] }
) {
  const normalizedPlate = typeof row.normalizedPlate === "string" ? row.normalizedPlate : "";
  const rawPayload = (row.rawPayload || {}) as Record<string, unknown>;
  const latestLprEvent = (row.latestLprEvent || {}) as Record<string, unknown>;
  const rowSourceId = typeof row.sourceId === "string" ? row.sourceId : typeof row.lastSourceId === "string" ? row.lastSourceId : "";
  const rowDemoSessionId =
    typeof row.demoSessionId === "string"
      ? row.demoSessionId
      : typeof latestLprEvent.demoSessionId === "string"
        ? String(latestLprEvent.demoSessionId)
        : typeof rawPayload.demoSessionId === "string"
          ? String(rawPayload.demoSessionId)
          : "";
  const rowSourceKey = typeof rawPayload.sourceKey === "string" ? rawPayload.sourceKey : "";
  const rowPlate = typeof row.normalizedPlate === "string" ? row.normalizedPlate : normalizePlate(String(row.plate || rawPayload.plate || ""));
  const rowLinkedPlate = typeof row.linkedEntityId === "string" ? row.linkedEntityId : "";
  const rowTriggerEventId = typeof row.triggerEventId === "string" ? row.triggerEventId : "";
  const rowDedupeKey = typeof row.dedupeKey === "string" ? row.dedupeKey : "";

  if (criteria.demoSessionId && rowDemoSessionId === criteria.demoSessionId) return true;
  if (criteria.sourceId && rowSourceId === criteria.sourceId) return true;
  if (criteria.sourceKey && rowSourceKey === criteria.sourceKey) return true;
  if (criteria.sourceId && rowDedupeKey.includes(criteria.sourceId)) return true;
  if (criteria.plates.length > 0) {
    if (criteria.plates.includes(normalizedPlate) || criteria.plates.includes(rowPlate) || criteria.plates.includes(rowLinkedPlate)) return true;
    if (criteria.plates.some((plate) => rowDedupeKey.includes(plate))) return true;
    if (criteria.plates.some((plate) => rowTriggerEventId.includes(plate))) return true;
  }
  return false;
}

export function createTestController(repo: IDataRepository) {
  return {
    seedPayment: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("pay_");
      await repo.setDoc(COLLECTIONS.payments, id, {
        id,
        organizationId: req.body.organizationId || req.authContext?.organizationIds?.[0] || null,
        lotId: req.body.lotId,
        plate: req.body.plate,
        normalizedPlate: normalizePlate(req.body.plate),
        status: "active",
        paymentType: req.body.paymentType || "manual_override",
        source: "manual",
        validFrom: req.body.validFrom || new Date(Date.now() - 5 * 60_000).toISOString(),
        validUntil: req.body.validUntil || new Date(Date.now() + 60 * 60_000).toISOString(),
        createdByUserId: req.authContext?.uid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    seedPermit: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("permit_");
      await repo.setDoc(COLLECTIONS.permits, id, {
        id,
        organizationId: req.body.organizationId || req.authContext?.organizationIds?.[0] || null,
        lotId: req.body.lotId,
        plate: req.body.plate,
        normalizedPlate: normalizePlate(req.body.plate),
        status: "active",
        permitType: req.body.permitType || "allowlist",
        validFrom: req.body.validFrom || new Date(Date.now() - 5 * 60_000).toISOString(),
        validUntil: req.body.validUntil || new Date(Date.now() + 60 * 60_000).toISOString(),
        createdByUserId: req.authContext?.uid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    resetLot: async (req: Request, res: Response): Promise<void> => {
      const lotId = req.body.lotId || req.query.lotId;
      if (!lotId) {
        sendSuccess(res, { cleared: 0 });
        return;
      }

      const collections = [
        COLLECTIONS.events,
        COLLECTIONS.vehicleStates,
        COLLECTIONS.parkingSessions,
        COLLECTIONS.violations,
        COLLECTIONS.notifications,
        COLLECTIONS.auditLogs,
        COLLECTIONS.processingLocks
      ];

      let cleared = 0;
      for (const collection of collections) {
        const docs = await repo.listDocs<{ id: string; lotId?: string }>(collection, {
          filters: [["lotId", "==", lotId]]
        });
        for (const doc of docs) {
          await repo.deleteDoc(collection, doc.id);
          cleared += 1;
        }
      }

      sendSuccess(res, { lotId, cleared });
    },

    cleanupDemoSession: async (req: Request, res: Response): Promise<void> => {
      const lotId = req.body.lotId || req.query.lotId;
      const demoSessionId = typeof req.body.demoSessionId === "string" ? req.body.demoSessionId : null;
      const sourceId = typeof req.body.sourceId === "string" ? req.body.sourceId : null;
      const sourceKey = typeof req.body.sourceKey === "string" ? req.body.sourceKey : null;
      const plates = Array.isArray(req.body.plates) ? req.body.plates.map((plate: unknown) => normalizePlate(String(plate || ""))).filter(Boolean) : [];

      if (!lotId || (!demoSessionId && !sourceId && !sourceKey && plates.length === 0)) {
        sendSuccess(res, { cleared: 0, reason: "cleanup scope required" });
        return;
      }

      const collections = [
        COLLECTIONS.events,
        COLLECTIONS.vehicleStates,
        COLLECTIONS.parkingSessions,
        COLLECTIONS.violations,
        COLLECTIONS.notifications,
        COLLECTIONS.auditLogs,
        COLLECTIONS.processingLocks
      ];

      let cleared = 0;
      for (const collection of collections) {
        const docs =
          collection === COLLECTIONS.processingLocks
            ? await repo.listDocs<Record<string, unknown>>(collection)
            : await repo.listDocs<Record<string, unknown>>(collection, {
                filters: [["lotId", "==", lotId]]
              });

        for (const doc of docs) {
          if (
            matchesCleanupScope(doc, {
              demoSessionId,
              sourceId,
              sourceKey,
              plates
            })
          ) {
            await repo.deleteDoc(collection, String(doc.id));
            cleared += 1;
          }
        }
      }

      sendSuccess(res, { lotId, demoSessionId, sourceId, sourceKey, plates, cleared });
    }
  };
}
