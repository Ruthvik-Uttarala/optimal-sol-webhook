import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { normalizePlate } from "../utils/normalize";
import { makePrefixedId } from "../utils/id";

export function createPermitsController(repo: IDataRepository) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      if (req.query.lotId) filters.push(["lotId", "==", req.query.lotId]);
      if (req.query.plate) filters.push(["normalizedPlate", "==", normalizePlate(String(req.query.plate))]);
      if (req.query.status) filters.push(["status", "==", req.query.status]);
      const rows = await repo.listDocs(COLLECTIONS.permits, {
        filters,
        orderBy: "validUntil",
        direction: "desc",
        limit: 100
      });
      sendSuccess(res, rows);
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const row = await repo.getDoc(COLLECTIONS.permits, String(req.params.permitId));
      sendSuccess(res, row);
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("permit_");
      await repo.setDoc(COLLECTIONS.permits, id, {
        id,
        organizationId: req.body.organizationId || req.authContext?.organizationIds?.[0] || null,
        lotId: req.body.lotId,
        plate: req.body.plate,
        normalizedPlate: normalizePlate(req.body.plate),
        status: "active",
        permitType: req.body.permitType,
        validFrom: req.body.validFrom || null,
        validUntil: req.body.validUntil || null,
        createdByUserId: req.authContext?.uid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "permit_created",
        entityType: "permit",
        entityId: id,
        summary: "Permit created",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    patch: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.permits, String(req.params.permitId), {
        ...req.body,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "permit_updated",
        entityType: "permit",
        entityId: String(req.params.permitId),
        summary: "Permit updated",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.permitId) });
    },

    deactivate: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.permits, String(req.params.permitId), {
        status: "inactive",
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "permit_deactivated",
        entityType: "permit",
        entityId: String(req.params.permitId),
        summary: "Permit deactivated",
        beforeSnapshot: null,
        afterSnapshot: { status: "inactive" },
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.permitId) });
    }
  };
}

