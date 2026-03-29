import admin from "firebase-admin";
import type { NextFunction, Request, Response } from "express";
import { env, getInternalTestKey } from "../config/env";
import { ERROR_CODES } from "../config/constants";
import type { GlobalRole } from "../types/domain";
import { AppError } from "../utils/errors";
import type { IDataRepository } from "../repositories/firestoreRepository";

if (!admin.apps.length) {
  admin.initializeApp();
}

function parseTestUserHeader(req: Request): { uid: string; email: string | null; role: GlobalRole } | null {
  if (!env.allowTestHeaders) return null;
  const raw = req.header("x-test-user");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { uid: string; email?: string | null; role?: GlobalRole };
    if (!parsed.uid || !parsed.role) return null;
    return { uid: parsed.uid, email: parsed.email || null, role: parsed.role };
  } catch {
    return null;
  }
}

interface AuthOptions {
  allowMissingRole?: boolean;
}

export function createAuthMiddleware(repo: IDataRepository, options: AuthOptions = {}) {
  return async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const testUser = parseTestUserHeader(req);
      if (testUser) {
        const access = await repo.getUserAccess(testUser.uid);
        req.authContext = {
          uid: testUser.uid,
          email: testUser.email,
          role: (access.role as GlobalRole) || testUser.role,
          lotIds: access.lotIds,
          organizationIds: access.organizationIds
        };
        next();
        return;
      }

      const authHeader = req.header("authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing Bearer token");
      }

      const token = authHeader.slice("Bearer ".length).trim();
      if (!token) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing Bearer token");
      }

      const decoded = await admin.auth().verifyIdToken(token, true);
      const access = await repo.getUserAccess(decoded.uid);
      const role = access.role as GlobalRole | null;
      if (!role && !options.allowMissingRole) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "No user role configured");
      }

      req.authContext = {
        uid: decoded.uid,
        email: decoded.email || null,
        role: role || null,
        lotIds: access.lotIds,
        organizationIds: access.organizationIds
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(roles: GlobalRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ctx = req.authContext;
    if (!ctx) {
      next(new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required"));
      return;
    }

    if (ctx.role && (ctx.role === "super_admin" || roles.includes(ctx.role))) {
      next();
      return;
    }

    next(new AppError(403, ERROR_CODES.FORBIDDEN, "Insufficient role"));
  };
}

export function requireLotScope() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ctx = req.authContext;
    if (!ctx) {
      next(new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required"));
      return;
    }

    if (ctx.role === "super_admin") {
      next();
      return;
    }

    const lotId =
      (req.query.lotId as string | undefined) ||
      (req.body?.lotId as string | undefined) ||
      (req.body?.metadata?.lotId as string | undefined);

    if (!lotId || ctx.lotIds.includes(lotId)) {
      next();
      return;
    }

    next(new AppError(403, ERROR_CODES.FORBIDDEN, "Lot scope denied"));
  };
}

export function requireInternalTestKey() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = req.header("x-internal-test-key") || "";
    const secret = getInternalTestKey();
    if (!secret || token !== secret) {
      next(new AppError(403, ERROR_CODES.TEST_MODE_ONLY, "Internal test key required"));
      return;
    }
    next();
  };
}
