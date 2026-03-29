import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS, ERROR_CODES } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { AppError } from "../utils/errors";
import { assertLotAccess, listScopedDocs, loadScopedDocById, requireMutableViolationStatus } from "../utils/access";

async function transitionViolation(
  repo: IDataRepository,
  req: Request,
  violationId: string,
  nextStatus: "acknowledged" | "resolved" | "dismissed" | "escalated",
  extra: Record<string, unknown> = {}
): Promise<void> {
  const violation = await loadScopedDocById<Record<string, unknown> & { status?: string }>(repo, COLLECTIONS.violations, req.authContext, violationId);
  if (!violation) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Violation not found");
  assertLotAccess(req.authContext, String(violation.lotId || null), "Lot scope denied");
  requireMutableViolationStatus(String(violation.status || "open"), nextStatus);

  const patch: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    ...extra
  };

  if (nextStatus === "acknowledged") patch.acknowledgedAt = new Date().toISOString();
  if (nextStatus === "resolved") patch.resolvedAt = new Date().toISOString();
  if (nextStatus === "dismissed") patch.dismissedAt = new Date().toISOString();
  if (nextStatus === "escalated") patch.escalatedAt = new Date().toISOString();

  await repo.updateDoc(COLLECTIONS.violations, violationId, patch);

  await repo.createAuditLog({
    actorType: "user",
    actorUserId: req.authContext?.uid || null,
    actionType: `violation_${nextStatus}`,
    entityType: "violation",
    entityId: violationId,
    summary: `Violation ${nextStatus}`,
    beforeSnapshot: violation,
    afterSnapshot: patch,
    requestId: req.context.requestId,
    createdAt: new Date().toISOString()
  });
}

export function createViolationsController(repo: IDataRepository) {
  return {
    listViolations: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      for (const key of ["lotId", "status", "severity", "assignedToUserId"]) {
        if (req.query[key]) filters.push([key, "==", req.query[key]]);
      }
      if (req.query.plate) filters.push(["normalizedPlate", "==", String(req.query.plate).toUpperCase()]);

      const data = await listScopedDocs(repo, COLLECTIONS.violations, req.authContext, {
        filters,
        orderBy: "createdAt",
        direction: "desc",
        limit: req.query.limit ? Number(req.query.limit) : 100
      });
      sendSuccess(res, data);
    },

    getViolation: async (req: Request, res: Response): Promise<void> => {
      const row = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.violations, req.authContext, String(req.params.violationId));
      if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Violation not found");
      assertLotAccess(req.authContext, String(row.lotId || null), "Lot scope denied");
      sendSuccess(res, {
        ...row,
        summary: {
          status: row.status || null,
          severity: row.severity || null,
          assignedToUserId: row.assignedToUserId || null,
          ageMinutes: row.createdAt ? Math.max(0, Math.floor((Date.now() - Date.parse(String(row.createdAt))) / 60000)) : null
        }
      });
    },

    acknowledge: async (req: Request, res: Response): Promise<void> => {
      await transitionViolation(repo, req, String(req.params.violationId), "acknowledged");
      sendSuccess(res, { id: String(req.params.violationId) });
    },

    resolve: async (req: Request, res: Response): Promise<void> => {
      await transitionViolation(repo, req, String(req.params.violationId), "resolved", {
        resolutionNotes: req.body.notes || req.body.reason || null
      });
      sendSuccess(res, { id: String(req.params.violationId) });
    },

    dismiss: async (req: Request, res: Response): Promise<void> => {
      await transitionViolation(repo, req, String(req.params.violationId), "dismissed", {
        dismissalReason: req.body.reason
      });
      sendSuccess(res, { id: String(req.params.violationId) });
    },

    escalate: async (req: Request, res: Response): Promise<void> => {
      await transitionViolation(repo, req, String(req.params.violationId), "escalated", {
        severity: "critical"
      });
      sendSuccess(res, { id: String(req.params.violationId) });
    },

    assign: async (req: Request, res: Response): Promise<void> => {
      const violation = await loadScopedDocById<Record<string, unknown> & { status?: string }>(repo, COLLECTIONS.violations, req.authContext, String(req.params.violationId));
      if (!violation) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Violation not found");
      assertLotAccess(req.authContext, String(violation.lotId || null), "Lot scope denied");
      const currentStatus = String(violation.status || "open");
      if (["resolved", "dismissed"].includes(currentStatus)) {
        throw new AppError(409, ERROR_CODES.VIOLATION_STATE_INVALID, `Cannot assign a ${currentStatus} violation`);
      }
      await repo.updateDoc(COLLECTIONS.violations, String(req.params.violationId), {
        assignedToUserId: req.body.assignedToUserId,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "violation_assigned",
        entityType: "violation",
        entityId: String(req.params.violationId),
        summary: `Violation assigned to ${req.body.assignedToUserId}`,
        beforeSnapshot: violation,
        afterSnapshot: { assignedToUserId: req.body.assignedToUserId },
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.violationId) });
    },

    audit: async (req: Request, res: Response): Promise<void> => {
      const violation = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.violations, req.authContext, String(req.params.violationId));
      if (!violation) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Violation not found");
      assertLotAccess(req.authContext, String(violation.lotId || null), "Lot scope denied");
      const rows = await repo.listDocs(COLLECTIONS.auditLogs, {
        filters: [
          ["entityType", "==", "violation"],
          ["entityId", "==", String(req.params.violationId)]
        ],
        orderBy: "createdAt",
        direction: "desc"
      });
      sendSuccess(res, rows);
    }
  };
}
