import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { makePrefixedId } from "../utils/id";

export function createSourcesController(repo: IDataRepository) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      if (req.query.lotId) filters.push(["lotId", "==", req.query.lotId]);
      if (req.query.status) filters.push(["status", "==", req.query.status]);
      const rows = await repo.listDocs(COLLECTIONS.sources, {
        filters,
        orderBy: "createdAt",
        direction: "desc"
      });
      sendSuccess(res, rows);
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const row = await repo.getDoc(COLLECTIONS.sources, String(req.params.sourceId));
      sendSuccess(res, row);
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("src_");
      await repo.setDoc(COLLECTIONS.sources, id, {
        id,
        organizationId: req.body.organizationId,
        lotId: req.body.lotId,
        name: req.body.name,
        sourceKey: req.body.sourceKey,
        type: req.body.type,
        status: req.body.status,
        directionMode: req.body.directionMode,
        cameraLabel: req.body.cameraLabel || null,
        laneLabel: req.body.laneLabel || null,
        sharedSecretId: req.body.sharedSecretId || null,
        metadata: req.body.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: req.authContext?.uid || null
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "source_created",
        entityType: "source",
        entityId: id,
        summary: "Source created",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    patch: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.sources, String(req.params.sourceId), {
        ...req.body,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "source_updated",
        entityType: "source",
        entityId: String(req.params.sourceId),
        summary: "Source updated",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.sourceId) });
    },

    deactivate: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.sources, String(req.params.sourceId), {
        status: "inactive",
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "source_updated",
        entityType: "source",
        entityId: String(req.params.sourceId),
        summary: "Source deactivated",
        beforeSnapshot: null,
        afterSnapshot: { status: "inactive" },
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.sourceId) });
    }
  };
}

