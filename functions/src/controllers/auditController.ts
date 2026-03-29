import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";

export function createAuditController(repo: IDataRepository) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      if (req.query.entityType) filters.push(["entityType", "==", req.query.entityType]);
      if (req.query.entityId) filters.push(["entityId", "==", req.query.entityId]);
      const rows = await repo.listDocs(COLLECTIONS.auditLogs, {
        filters,
        orderBy: "createdAt",
        direction: "desc",
        limit: req.query.limit ? Number(req.query.limit) : 200
      });
      sendSuccess(res, rows);
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const row = await repo.getDoc(COLLECTIONS.auditLogs, String(req.params.auditId));
      sendSuccess(res, row);
    }
  };
}

