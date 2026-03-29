import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { normalizePlate } from "../utils/normalize";
import { makePrefixedId } from "../utils/id";

export function createPaymentsController(repo: IDataRepository) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      if (req.query.lotId) filters.push(["lotId", "==", req.query.lotId]);
      if (req.query.plate) filters.push(["normalizedPlate", "==", normalizePlate(String(req.query.plate))]);
      if (req.query.status) filters.push(["status", "==", req.query.status]);
      const rows = await repo.listDocs(COLLECTIONS.payments, {
        filters,
        orderBy: "validUntil",
        direction: "desc",
        limit: 100
      });
      sendSuccess(res, rows);
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const row = await repo.getDoc(COLLECTIONS.payments, String(req.params.paymentId));
      sendSuccess(res, row);
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("pay_");
      await repo.setDoc(COLLECTIONS.payments, id, {
        id,
        organizationId: req.body.organizationId || req.authContext?.organizationIds?.[0] || null,
        lotId: req.body.lotId,
        plate: req.body.plate,
        normalizedPlate: normalizePlate(req.body.plate),
        status: "active",
        paymentType: req.body.paymentType,
        source: req.body.source,
        validFrom: req.body.validFrom,
        validUntil: req.body.validUntil,
        createdByUserId: req.authContext?.uid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "payment_created",
        entityType: "payment",
        entityId: id,
        summary: "Payment created",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    patch: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.payments, String(req.params.paymentId), {
        ...req.body,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "payment_updated",
        entityType: "payment",
        entityId: String(req.params.paymentId),
        summary: "Payment updated",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.paymentId) });
    },

    cancel: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.payments, String(req.params.paymentId), {
        status: "cancelled",
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "payment_cancelled",
        entityType: "payment",
        entityId: String(req.params.paymentId),
        summary: "Payment cancelled",
        beforeSnapshot: null,
        afterSnapshot: { status: "cancelled" },
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.paymentId) });
    }
  };
}

