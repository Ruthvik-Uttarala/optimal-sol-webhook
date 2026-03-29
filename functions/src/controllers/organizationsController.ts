import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { makePrefixedId } from "../utils/id";

export function createOrganizationsController(repo: IDataRepository) {
  return {
    listOrganizations: async (_req: Request, res: Response): Promise<void> => {
      const rows = await repo.listDocs(COLLECTIONS.organizations, {
        orderBy: "createdAt",
        direction: "desc"
      });
      sendSuccess(res, rows);
    },

    getOrganization: async (req: Request, res: Response): Promise<void> => {
      const row = await repo.getDoc(COLLECTIONS.organizations, String(req.params.organizationId));
      sendSuccess(res, row);
    },

    listLots: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      if (req.query.organizationId) filters.push(["organizationId", "==", req.query.organizationId]);
      const rows = await repo.listDocs(COLLECTIONS.lots, {
        filters,
        orderBy: "createdAt",
        direction: "desc"
      });
      sendSuccess(res, rows);
    },

    getLot: async (req: Request, res: Response): Promise<void> => {
      const row = await repo.getDoc(COLLECTIONS.lots, String(req.params.lotId));
      sendSuccess(res, row);
    },

    createLot: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("lot_");
      await repo.setDoc(COLLECTIONS.lots, id, {
        id,
        organizationId: req.body.organizationId,
        name: req.body.name,
        slug: req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        status: req.body.status || "active",
        timezone: req.body.timezone,
        addressLine1: req.body.addressLine1 || null,
        addressLine2: req.body.addressLine2 || null,
        city: req.body.city || null,
        state: req.body.state || null,
        postalCode: req.body.postalCode || null,
        country: req.body.country || "US",
        capacity: req.body.capacity || null,
        enforcementEnabled: req.body.enforcementEnabled ?? true,
        testModeEnabled: req.body.testModeEnabled ?? true,
        gracePeriodMinutesDefault: req.body.gracePeriodMinutesDefault ?? 10,
        duplicateWindowSecondsDefault: req.body.duplicateWindowSecondsDefault ?? 120,
        entryPolicyMode: "event_driven",
        exitPolicyMode: "event_driven",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: req.authContext?.uid || null
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "lot_created",
        entityType: "lot",
        entityId: id,
        summary: "Lot created",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    patchLot: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.lots, String(req.params.lotId), {
        ...req.body,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "lot_updated",
        entityType: "lot",
        entityId: String(req.params.lotId),
        summary: "Lot updated",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.lotId) });
    }
  };
}

