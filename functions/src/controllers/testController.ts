import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { normalizePlate } from "../utils/normalize";
import { makePrefixedId } from "../utils/id";
import { sendSuccess } from "../utils/response";

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
    }
  };
}
