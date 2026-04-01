import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { sendSuccess } from "../utils/response";
import { getSystemConfig, getSystemMetrics, getSystemStatus } from "../services/systemService";

export function createSystemController(repo: IDataRepository) {
  return {
    health: async (_req: Request, res: Response): Promise<void> => {
      sendSuccess(res, {
        status: "ok",
        service: "parking-sol-functions",
        version: "v1"
      });
    },

    status: async (req: Request, res: Response): Promise<void> => {
      const scopedLotIds = req.query.lotId ? [String(req.query.lotId)] : req.authContext?.lotIds || [];
      const data = await getSystemStatus(repo, scopedLotIds);
      sendSuccess(res, data);
    },

    config: async (_req: Request, res: Response): Promise<void> => {
      const data = await getSystemConfig(repo);
      sendSuccess(res, data);
    },

    patchConfig: async (req: Request, res: Response): Promise<void> => {
      const current = await getSystemConfig(repo);
      const nextConfig = {
        ...current,
        ...req.body,
        updatedAt: new Date().toISOString(),
        updatedByUserId: req.authContext?.uid || null
      };

      await repo.setDoc("systemConfig", "global", nextConfig, true);
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "system_config_changed",
        entityType: "system_config",
        entityId: "global",
        summary: "System configuration updated",
        beforeSnapshot: current,
        afterSnapshot: nextConfig,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });

      sendSuccess(res, nextConfig);
    },

    metrics: async (req: Request, res: Response): Promise<void> => {
      const scopedLotIds = req.query.lotId ? [String(req.query.lotId)] : req.authContext?.lotIds || [];
      const data = await getSystemMetrics(repo, scopedLotIds);
      sendSuccess(res, data);
    }
  };
}
