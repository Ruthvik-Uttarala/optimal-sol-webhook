import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { makePrefixedId } from "../utils/id";
import { assertLotAccess, listScopedDocs, loadScopedDocById } from "../utils/access";

export function createRulesController(repo: IDataRepository) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      if (req.query.lotId) filters.push(["lotId", "==", req.query.lotId]);
      if (req.query.status) filters.push(["status", "==", req.query.status]);
      const rows = await listScopedDocs(repo, COLLECTIONS.rules, req.authContext, {
        filters,
        orderBy: "priority",
        direction: "asc",
        limit: 100
      });
      sendSuccess(res, rows);
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const row = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.rules, req.authContext, String(req.params.ruleId));
      sendSuccess(res, row);
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("rule_");
      assertLotAccess(req.authContext, req.body.lotId, "Lot scope denied");
      await repo.setDoc(COLLECTIONS.rules, id, {
        id,
        organizationId: req.body.organizationId || req.authContext?.organizationIds?.[0] || null,
        lotId: req.body.lotId,
        name: req.body.name,
        description: req.body.description,
        type: req.body.type,
        status: req.body.status,
        priority: req.body.priority,
        conditions: req.body.conditions,
        actions: req.body.actions,
        effectiveFrom: req.body.effectiveFrom || null,
        effectiveTo: req.body.effectiveTo || null,
        createdByUserId: req.authContext?.uid || null,
        updatedByUserId: req.authContext?.uid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "rule_created",
        entityType: "rule",
        entityId: id,
        summary: "Rule created",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    patch: async (req: Request, res: Response): Promise<void> => {
      const existing = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.rules, req.authContext, String(req.params.ruleId));
      assertLotAccess(req.authContext, String(existing?.lotId || req.body.lotId || null), "Lot scope denied");
      await repo.updateDoc(COLLECTIONS.rules, String(req.params.ruleId), {
        ...req.body,
        updatedByUserId: req.authContext?.uid || null,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "rule_updated",
        entityType: "rule",
        entityId: String(req.params.ruleId),
        summary: "Rule updated",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.ruleId) });
    },

    activate: async (req: Request, res: Response): Promise<void> => {
      const existing = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.rules, req.authContext, String(req.params.ruleId));
      assertLotAccess(req.authContext, String(existing?.lotId || null), "Lot scope denied");
      await repo.updateDoc(COLLECTIONS.rules, String(req.params.ruleId), {
        status: "active",
        updatedByUserId: req.authContext?.uid || null,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "rule_activated",
        entityType: "rule",
        entityId: String(req.params.ruleId),
        summary: "Rule activated",
        beforeSnapshot: null,
        afterSnapshot: { status: "active" },
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.ruleId) });
    },

    deactivate: async (req: Request, res: Response): Promise<void> => {
      const existing = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.rules, req.authContext, String(req.params.ruleId));
      assertLotAccess(req.authContext, String(existing?.lotId || null), "Lot scope denied");
      await repo.updateDoc(COLLECTIONS.rules, String(req.params.ruleId), {
        status: "inactive",
        updatedByUserId: req.authContext?.uid || null,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "rule_deactivated",
        entityType: "rule",
        entityId: String(req.params.ruleId),
        summary: "Rule deactivated",
        beforeSnapshot: null,
        afterSnapshot: { status: "inactive" },
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.ruleId) });
    },

    audit: async (req: Request, res: Response): Promise<void> => {
      const existing = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.rules, req.authContext, String(req.params.ruleId));
      assertLotAccess(req.authContext, String(existing?.lotId || null), "Lot scope denied");
      const rows = await repo.listDocs(COLLECTIONS.auditLogs, {
        filters: [
          ["entityType", "==", "rule"],
          ["entityId", "==", String(req.params.ruleId)]
        ],
        orderBy: "createdAt",
        direction: "desc"
      });
      sendSuccess(res, rows);
    }
  };
}

