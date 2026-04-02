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

async function ensureUserProfile(repo: IDataRepository, authContext: ReturnType<typeof getAuthContext>) {
  const existingProfile = await repo.getDoc<Record<string, unknown>>(COLLECTIONS.users, authContext.uid);
  if (existingProfile) {
    return {
      profile: existingProfile,
      profileMissing: false
    };
  }

  const createdAt = new Date().toISOString();
  const nextProfile = {
    id: authContext.uid,
    email: authContext.email || null,
    displayName: authContext.email || authContext.uid,
    status: "pending_access",
    globalRole: null,
    defaultOrganizationId: authContext.organizationIds[0] || null,
    defaultLotId: authContext.lotIds[0] || null,
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    createdAt,
    updatedAt: createdAt
  };

  await repo.setDoc(COLLECTIONS.users, authContext.uid, nextProfile, true);
  return {
    profile: nextProfile,
    profileMissing: true
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function resolveAccessScope(
  repo: IDataRepository,
  authContext: ReturnType<typeof getAuthContext>,
  profile: Record<string, unknown>
) {
  const accessRows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.userLotAccess, {
    filters: [
      ["userId", "==", authContext.uid],
      ["status", "==", "active"]
    ]
  });

  const sortedAccessRows = [...accessRows].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const effectiveRole = (profile.globalRole || authContext.role || null) as string | null;
  const status = String(profile.status || (effectiveRole ? "active" : "pending_access"));
  const lotIds = uniqueStrings(sortedAccessRows.map((row) => String(row.lotId || "")));
  const organizationIds = uniqueStrings(sortedAccessRows.map((row) => String(row.organizationId || "")));
  const organizations = (
    await Promise.all(
      organizationIds.map(async (organizationId) => repo.getDoc<Record<string, unknown>>(COLLECTIONS.organizations, organizationId))
    )
  ).filter(Boolean) as Record<string, unknown>[];
  const lots = (
    await Promise.all(lotIds.map(async (lotId) => repo.getDoc<Record<string, unknown>>(COLLECTIONS.lots, lotId)))
  ).filter(Boolean) as Record<string, unknown>[];

  const defaultLotId = typeof profile.defaultLotId === "string" && lotIds.includes(profile.defaultLotId)
    ? profile.defaultLotId
    : null;
  const defaultOrganizationId = typeof profile.defaultOrganizationId === "string" && organizationIds.includes(profile.defaultOrganizationId)
    ? profile.defaultOrganizationId
    : null;
  const resolvedLotId = defaultLotId || lotIds[0] || null;
  const resolvedOrganizationId = defaultOrganizationId || organizationIds[0] || null;
  const hasActiveScope = effectiveRole === "super_admin" || lotIds.length > 0;
  const blockedReason =
    status === "active" && effectiveRole && effectiveRole !== "super_admin" && !hasActiveScope ? "NO_ACTIVE_SCOPE" : null;

  return {
    accessRecords: sortedAccessRows,
    organizations,
    lots,
    organizationIds,
    lotIds,
    effectiveRole,
    status,
    hasActiveScope,
    defaultOrganizationId,
    defaultLotId,
    resolvedOrganizationId,
    resolvedLotId,
    blockedReason
  };
}

export function createMeController(repo: IDataRepository) {
  return {
    me: async (req: Request, res: Response): Promise<void> => {
      const authContext = getAuthContext(req);
      const { profile, profileMissing } = await ensureUserProfile(repo, authContext);
      const scope = await resolveAccessScope(repo, authContext, profile);

      sendSuccess(res, {
        ...profile,
        id: authContext.uid,
        email: profile?.email || authContext.email || null,
        displayName: profile?.displayName || authContext.email || authContext.uid,
        status: scope.status,
        globalRole: scope.effectiveRole,
        effectiveRole: scope.effectiveRole,
        organizationIds: scope.organizationIds,
        lotIds: scope.lotIds,
        defaultOrganizationId: scope.defaultOrganizationId,
        defaultLotId: scope.defaultLotId,
        resolvedOrganizationId: scope.resolvedOrganizationId,
        resolvedLotId: scope.resolvedLotId,
        currentLotId: scope.resolvedLotId,
        hasActiveScope: scope.hasActiveScope,
        notificationPreferences: profile?.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES,
        profileMissing,
        accessContext: {
          effectiveRole: scope.effectiveRole,
          lotIds: scope.lotIds,
          organizationIds: scope.organizationIds,
          activeAccessCount: scope.accessRecords.length,
          hasActiveScope: scope.hasActiveScope,
          resolvedOrganizationId: scope.resolvedOrganizationId,
          resolvedLotId: scope.resolvedLotId,
          blockedReason: scope.blockedReason
        }
      });
    },

    patchPreferences: async (req: Request, res: Response): Promise<void> => {
      const authContext = getAuthContext(req);
      await ensureUserProfile(repo, authContext);
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
      const { profile } = await ensureUserProfile(repo, authContext);
      const scope = await resolveAccessScope(repo, authContext, profile);
      sendSuccess(res, {
        userId: authContext.uid,
        status: scope.status,
        effectiveRole: scope.effectiveRole,
        hasActiveScope: scope.hasActiveScope,
        defaultOrganizationId: scope.defaultOrganizationId,
        defaultLotId: scope.defaultLotId,
        resolvedOrganizationId: scope.resolvedOrganizationId,
        resolvedLotId: scope.resolvedLotId,
        currentLotId: scope.resolvedLotId,
        organizationIds: scope.organizationIds,
        lotIds: scope.lotIds,
        organizations: scope.organizations,
        lots: scope.lots,
        blockedReason: scope.blockedReason,
        accessRecords: scope.accessRecords
      });
    }
  };
}
