import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { AppError } from "../utils/errors";

const DEFAULT_NOTIFICATION_PREFERENCES = {
  inAppViolations: true,
  inAppSystemAlerts: true,
  inAppAssignments: true,
  soundEnabled: false,
  digestEnabled: false
};

function getAuthContext(req: Request) {
  const authContext = req.authContext;
  if (!authContext) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return authContext;
}

export function createMeController(repo: IDataRepository) {
  return {
    me: async (req: Request, res: Response): Promise<void> => {
      const authContext = getAuthContext(req);
      const profile = await repo.getDoc<Record<string, unknown>>(COLLECTIONS.users, authContext.uid);
      const accessRows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.userLotAccess, {
        filters: [
          ["userId", "==", authContext.uid],
          ["status", "==", "active"]
        ],
        orderBy: "createdAt",
        direction: "desc"
      });

      sendSuccess(res, {
        ...(profile || {
          id: authContext.uid,
          status: "active",
          email: authContext.email || null,
          displayName: authContext.email || authContext.uid
        }),
        id: authContext.uid,
        email: profile?.email || authContext.email || null,
        displayName: profile?.displayName || authContext.email || authContext.uid,
        status: profile?.status || "active",
        globalRole: profile?.globalRole || authContext.role,
        effectiveRole: profile?.globalRole || authContext.role,
        organizationIds: authContext.organizationIds,
        lotIds: authContext.lotIds,
        defaultOrganizationId: profile?.defaultOrganizationId || authContext.organizationIds[0] || null,
        defaultLotId: profile?.defaultLotId || authContext.lotIds[0] || null,
        currentLotId: profile?.defaultLotId || authContext.lotIds[0] || null,
        notificationPreferences: profile?.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES,
        profileMissing: !profile,
        accessContext: {
          effectiveRole: profile?.globalRole || authContext.role,
          lotIds: authContext.lotIds,
          organizationIds: authContext.organizationIds,
          activeAccessCount: accessRows.length
        }
      });
    },

    patchPreferences: async (req: Request, res: Response): Promise<void> => {
      const authContext = getAuthContext(req);
      await repo.updateDoc(COLLECTIONS.users, authContext.uid, {
        notificationPreferences: req.body,
        updatedAt: new Date().toISOString()
      });
      await repo.createAuditLog({
        actorType: "user",
        actorUserId: authContext.uid,
        actionType: "user_preferences_updated",
        entityType: "user",
        entityId: authContext.uid,
        summary: "Updated notification preferences",
        beforeSnapshot: null,
        afterSnapshot: req.body,
        requestId: req.context.requestId,
        createdAt: new Date().toISOString()
      });
      sendSuccess(res, { id: authContext.uid });
    },

    access: async (req: Request, res: Response): Promise<void> => {
      const authContext = getAuthContext(req);
      const rows = await repo.listDocs(COLLECTIONS.userLotAccess, {
        filters: [
          ["userId", "==", authContext.uid],
          ["status", "==", "active"]
        ],
        orderBy: "createdAt",
        direction: "desc"
      });
      sendSuccess(res, {
        userId: authContext.uid,
        effectiveRole: authContext.role,
        defaultOrganizationId: authContext.organizationIds[0] || null,
        defaultLotId: authContext.lotIds[0] || null,
        currentLotId: authContext.lotIds[0] || null,
        organizationIds: authContext.organizationIds,
        lotIds: authContext.lotIds,
        accessRecords: rows
      });
    }
  };
}
