import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { AppError } from "../utils/errors";
import { normalizePlate } from "../utils/normalize";
import { assertLotAccess, listScopedDocs, loadScopedDocByPlate } from "../utils/access";

export function createVehiclesController(repo: IDataRepository) {
  return {
    listVehicles: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      if (req.query.lotId) filters.push(["lotId", "==", req.query.lotId]);
      const vehicles = await listScopedDocs(repo, COLLECTIONS.vehicleStates, req.authContext, {
        filters,
        orderBy: "updatedAt",
        direction: "desc",
        limit: req.query.limit ? Number(req.query.limit) : 100
      });
      sendSuccess(res, vehicles);
    },

    getVehicle: async (req: Request, res: Response): Promise<void> => {
      const normalizedPlate = normalizePlate(String(req.params.normalizedPlate));
      const vehicle = await loadScopedDocByPlate<Record<string, unknown>>(repo, COLLECTIONS.vehicleStates, req.authContext, normalizedPlate);
      if (!vehicle) throw new AppError(404, "NOT_FOUND", "Vehicle not found");
      assertLotAccess(req.authContext, String(vehicle.lotId || null), "Lot scope denied");
      sendSuccess(res, {
        ...vehicle,
        summary: {
          currentStatus: vehicle.currentStatus || null,
          presenceStatus: vehicle.presenceStatus || null,
          paymentState: vehicle.currentPaymentId ? "active" : "none",
          permitState: vehicle.currentPermitId ? "active" : "none"
        }
      });
    },

    vehicleEvents: async (req: Request, res: Response): Promise<void> => {
      const normalizedPlate = normalizePlate(String(req.params.normalizedPlate));
      const rows = await listScopedDocs(repo, COLLECTIONS.events, req.authContext, {
        filters: [["normalizedPlate", "==", normalizedPlate]],
        orderBy: "capturedAt",
        direction: "desc",
        limit: req.query.limit ? Number(req.query.limit) : 100
      });
      sendSuccess(res, rows);
    },

    vehicleViolations: async (req: Request, res: Response): Promise<void> => {
      const normalizedPlate = normalizePlate(String(req.params.normalizedPlate));
      const rows = await listScopedDocs(repo, COLLECTIONS.violations, req.authContext, {
        filters: [["normalizedPlate", "==", normalizedPlate]],
        orderBy: "createdAt",
        direction: "desc"
      });
      sendSuccess(res, rows);
    },

    vehicleSessions: async (req: Request, res: Response): Promise<void> => {
      const normalizedPlate = normalizePlate(String(req.params.normalizedPlate));
      const rows = await listScopedDocs(repo, COLLECTIONS.parkingSessions, req.authContext, {
        filters: [["normalizedPlate", "==", normalizedPlate]],
        orderBy: "openedAt",
        direction: "desc"
      });
      sendSuccess(res, rows);
    },

    patchFlags: async (req: Request, res: Response): Promise<void> => {
      const normalizedPlate = normalizePlate(String(req.params.normalizedPlate));
      const row = await loadScopedDocByPlate<Record<string, unknown> & { id: string }>(repo, COLLECTIONS.vehicleStates, req.authContext, normalizedPlate);
      if (!row) throw new AppError(404, "NOT_FOUND", "Vehicle not found");
      assertLotAccess(req.authContext, String(row.lotId || null), "Lot scope denied");
      await repo.updateDoc(COLLECTIONS.vehicleStates, row.id, {
        flags: req.body.flags || [],
        notesSummary: req.body.notesSummary || null,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "vehicle_manual_flag_updated",
        entityType: "vehicle",
        entityId: row.id,
        summary: "Vehicle flags updated",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: row.id });
    }
  };
}

