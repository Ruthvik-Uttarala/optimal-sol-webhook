import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { makePrefixedId } from "../utils/id";
import { AppError } from "../utils/errors";
import { scopedLotIds } from "../utils/access";

export function createUsersController(repo: IDataRepository) {
  return {
    listUsers: async (req: Request, res: Response): Promise<void> => {
      const rows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.users, {
        orderBy: "createdAt",
        direction: "desc",
        limit: 200
      });
      const lotIds = scopedLotIds(req.authContext);
      if (lotIds.length === 0 || req.authContext?.role === "super_admin") {
        sendSuccess(res, rows);
        return;
      }

      const accessRows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.userLotAccess, {
        filters: [["status", "==", "active"]],
        limit: 500
      });
      const allowedUserIds = new Set(
        accessRows
          .filter((row) => lotIds.includes(String(row.lotId || "")))
          .map((row) => String(row.userId || ""))
      );
      allowedUserIds.add(req.authContext?.uid || "");

      sendSuccess(res, rows.filter((row) => allowedUserIds.has(String(row.id || ""))));
    },

    getUser: async (req: Request, res: Response): Promise<void> => {
      const row = await repo.getDoc<Record<string, unknown>>(COLLECTIONS.users, String(req.params.userId));
      if (req.authContext?.role !== "super_admin") {
        const lotIds = scopedLotIds(req.authContext);
        const accessRows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.userLotAccess, {
          filters: [
            ["userId", "==", String(req.params.userId)],
            ["status", "==", "active"]
          ]
        });
        const hasVisibleAccess =
          String(req.params.userId) === req.authContext?.uid ||
          accessRows.some((access) => lotIds.includes(String(access.lotId || "")));
        if (!hasVisibleAccess) {
          throw new AppError(403, "FORBIDDEN", "Lot scope denied");
        }
      }
      sendSuccess(res, row);
    },

    createUser: async (req: Request, res: Response): Promise<void> => {
      const id = req.body.id || makePrefixedId("usr_");
      await repo.setDoc(COLLECTIONS.users, id, {
        id,
        email: req.body.email,
        displayName: req.body.displayName,
        status: "invited",
        globalRole: req.body.globalRole,
        defaultOrganizationId: req.body.defaultOrganizationId || null,
        defaultLotId: req.body.defaultLotId || null,
        phoneNumber: null,
        avatarUrl: null,
        notificationPreferences: {
          inAppViolations: true,
          inAppSystemAlerts: true,
          inAppAssignments: true,
          soundEnabled: false,
          digestEnabled: false
        },
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: req.authContext?.uid || null
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "user_created",
        entityType: "user",
        entityId: id,
        summary: "User created",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    patchUser: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.users, String(req.params.userId), {
        ...req.body,
        updatedAt: new Date().toISOString()
      });
      if (req.body.globalRole) {
        await repo.createAuditLog({
          actorType: "user",
          actorUserId: req.authContext?.uid || null,
          actionType: "user_role_changed",
          entityType: "user",
          entityId: String(req.params.userId),
          summary: `Role changed to ${req.body.globalRole}`,
          beforeSnapshot: null,
          afterSnapshot: { globalRole: req.body.globalRole },
          requestId: req.context.requestId,
          createdAt: new Date().toISOString()
        });
      }
      sendSuccess(res, { id: String(req.params.userId) });
    },

    deactivateUser: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.users, String(req.params.userId), {
        status: "disabled",
        updatedAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.userId) });
    },

    reactivateUser: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.users, String(req.params.userId), {
        status: "active",
        updatedAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.userId) });
    },

    userAccess: async (req: Request, res: Response): Promise<void> => {
      const rows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.userLotAccess, {
        filters: [["userId", "==", String(req.params.userId)]],
        orderBy: "createdAt",
        direction: "desc"
      });
      const lotIds = scopedLotIds(req.authContext);
      if (lotIds.length > 0 && req.authContext?.role !== "super_admin") {
        const visibleRows = rows.filter((row) => lotIds.includes(String(row.lotId || "")));
        if (String(req.params.userId) !== req.authContext?.uid && visibleRows.length === 0) {
          throw new AppError(403, "FORBIDDEN", "Lot scope denied");
        }
        sendSuccess(res, visibleRows);
        return;
      }
      sendSuccess(res, rows);
    },

    createUserAccess: async (req: Request, res: Response): Promise<void> => {
      const id = makePrefixedId("access_");
      await repo.setDoc(COLLECTIONS.userLotAccess, id, {
        id,
        userId: String(req.params.userId),
        organizationId: req.body.organizationId,
        lotId: req.body.lotId,
        roleWithinLot: req.body.roleWithinLot,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: req.authContext?.uid || null
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "access_record_changed",
        entityType: "user_access",
        entityId: id,
        summary: "Access granted",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id }, 201);
    },

    patchAccess: async (req: Request, res: Response): Promise<void> => {
      const existing = await repo.getDoc(COLLECTIONS.userLotAccess, String(req.params.accessId));
      if (!existing) throw new AppError(404, "NOT_FOUND", "Access not found");
      await repo.updateDoc(COLLECTIONS.userLotAccess, String(req.params.accessId), {
        ...req.body,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "access_record_changed",
        entityType: "user_access",
        entityId: String(req.params.accessId),
        summary: "Access updated",
        beforeSnapshot: existing,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.accessId) });
    },

    revokeAccess: async (req: Request, res: Response): Promise<void> => {
      await repo.updateDoc(COLLECTIONS.userLotAccess, String(req.params.accessId), {
        status: "revoked",
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: req.authContext?.uid || null,
        actionType: "access_record_changed",
        entityType: "user_access",
        entityId: String(req.params.accessId),
        summary: "Access revoked",
        beforeSnapshot: null,
        afterSnapshot: { status: "revoked" },
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.accessId) });
    }
  };
}

