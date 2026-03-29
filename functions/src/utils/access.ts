import type { Request } from "express";
import { COLLECTIONS, ERROR_CODES } from "../config/constants";
import type { IDataRepository, ListOptions } from "../repositories/firestoreRepository";
import type { AuthContext } from "../types/domain";
import { AppError } from "./errors";

export function hasSuperAdminAccess(authContext?: AuthContext | null): boolean {
  return authContext?.role === "super_admin";
}

export function requireAuthContext(req: Request): AuthContext {
  if (!req.authContext) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required");
  }
  return req.authContext;
}

export function canAccessLot(authContext: AuthContext | undefined | null, lotId: string | null | undefined): boolean {
  if (!authContext) return false;
  if (authContext.role === "super_admin") return true;
  if (!lotId) return false;
  return authContext.lotIds.includes(lotId);
}

export function assertLotAccess(authContext: AuthContext | undefined | null, lotId: string | null | undefined, message = "Lot scope denied"): void {
  if (!authContext) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required");
  }
  if (!canAccessLot(authContext, lotId)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }
}

export function scopedLotIds(authContext: AuthContext | undefined | null): string[] {
  if (!authContext) return [];
  if (authContext.role === "super_admin") return [];
  return [...new Set(authContext.lotIds.filter(Boolean))];
}

export function getAccessibleLotIds(req: Request): string[] {
  return scopedLotIds(req.authContext);
}

function compareValues(left: unknown, right: unknown, direction: "asc" | "desc"): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return direction === "asc" ? 1 : -1;
  if (right === undefined || right === null) return direction === "asc" ? -1 : 1;
  if (left > right) return direction === "asc" ? 1 : -1;
  return direction === "asc" ? -1 : 1;
}

function sortRows<T extends Record<string, unknown>>(rows: T[], orderBy?: string, direction: "asc" | "desc" = "desc"): T[] {
  if (!orderBy) return rows;
  return [...rows].sort((a, b) => compareValues(a[orderBy], b[orderBy], direction));
}

export async function listScopedDocs<T extends Record<string, unknown>>(
  repo: IDataRepository,
  collection: string,
  authContext: AuthContext | undefined | null,
  options: ListOptions = {}
): Promise<T[]> {
  const lotIds = scopedLotIds(authContext);
  const limit = options.limit || 50;

  if (hasSuperAdminAccess(authContext) || lotIds.length === 0) {
    const rows = await repo.listDocs<T>(collection, options);
    return options.orderBy ? sortRows(rows, options.orderBy, options.direction || "desc").slice(0, limit) : rows.slice(0, limit);
  }

  const perLotLimit = Math.max(limit, 50);
  const rowsByLot = await Promise.all(
    lotIds.map((lotId) =>
      repo.listDocs<T>(collection, {
        ...options,
        filters: [...(options.filters || []), ["lotId", "==", lotId]],
        limit: perLotLimit
      })
    )
  );

  const merged = rowsByLot.flat();
  const unique = merged.filter(
    (row, index, all) =>
      all.findIndex((candidate) => {
        const candidateId = typeof candidate["id"] === "string" ? candidate["id"] : "";
        const rowId = typeof row["id"] === "string" ? row["id"] : "";
        return candidateId === rowId;
      }) === index
  );
  const sorted = options.orderBy ? sortRows(unique, options.orderBy, options.direction || "desc") : unique;
  return sorted.slice(0, limit);
}

export async function countScopedDocs(
  repo: IDataRepository,
  collection: string,
  authContext: AuthContext | undefined | null,
  filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = []
): Promise<number> {
  const lotIds = scopedLotIds(authContext);

  if (hasSuperAdminAccess(authContext) || lotIds.length === 0) {
    return repo.countDocs(collection, filters);
  }

  const counts = await Promise.all(
    lotIds.map((lotId) => repo.countDocs(collection, [...filters, ["lotId", "==", lotId]]))
  );

  return counts.reduce((sum, value) => sum + value, 0);
}

export async function loadScopedDocById<T extends Record<string, unknown>>(
  repo: IDataRepository,
  collection: string,
  authContext: AuthContext | undefined | null,
  id: string,
  message = "Lot scope denied"
): Promise<T | null> {
  const doc = await repo.getDoc<T>(collection, id);
  if (!doc) return null;
  const lotId = typeof doc["lotId"] === "string" ? (doc["lotId"] as string) : null;
  if (!hasSuperAdminAccess(authContext) && !canAccessLot(authContext, lotId)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }
  return doc;
}

export async function getAuthorizedDoc<T extends Record<string, unknown>>(
  repo: IDataRepository,
  req: Request,
  collection: string,
  id: string,
  options: { lotField?: string; ownerField?: string } = {}
): Promise<T> {
  const authContext = requireAuthContext(req);
  const row = await repo.getDoc<T>(collection, id);
  if (!row) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Resource not found");
  }

  if (hasSuperAdminAccess(authContext)) {
    return row;
  }

  const ownerField = options.ownerField;
  if (ownerField && row[ownerField] === authContext.uid) {
    return row;
  }

  const lotField = options.lotField || "lotId";
  const lotId = row[lotField];
  if (typeof lotId === "string") {
    assertLotAccess(authContext, lotId);
  }

  return row;
}

export async function loadScopedDocByPlate<T extends Record<string, unknown>>(
  repo: IDataRepository,
  collection: string,
  authContext: AuthContext | undefined | null,
  normalizedPlate: string
): Promise<T | null> {
  const docs = await repo.listDocs<T & { id?: string }>(collection, {
    filters: [["normalizedPlate", "==", normalizedPlate]],
    orderBy: "updatedAt",
    direction: "desc",
    limit: 100
  });

  for (const doc of docs) {
    const lotId = typeof doc["lotId"] === "string" ? (doc["lotId"] as string) : null;
    if (hasSuperAdminAccess(authContext) || canAccessLot(authContext, lotId)) {
      return doc;
    }
  }

  return null;
}

export function requireMutableViolationStatus(currentStatus: string | undefined, nextStatus: string): void {
  const allowed: Record<string, string[]> = {
    open: ["acknowledged", "resolved", "dismissed", "escalated"],
    acknowledged: ["resolved", "dismissed", "escalated"],
    escalated: ["resolved", "dismissed"],
    resolved: [],
    dismissed: []
  };

  const transitions = allowed[currentStatus || "open"] || [];
  if (!transitions.includes(nextStatus)) {
    throw new AppError(409, ERROR_CODES.VIOLATION_STATE_INVALID, `Cannot transition violation from ${currentStatus || "open"} to ${nextStatus}`);
  }
}
