import type { Request, Response } from "express";
import { sendSuccess } from "../utils/response";
import type { IDataRepository, QueryFilter } from "../repositories/firestoreRepository";
import { makePrefixedId } from "../utils/id";
import { ID_PREFIX } from "../config/constants";
import { AppError } from "../utils/errors";

export function buildFilters(query: Record<string, unknown>, allowedFields: string[]): QueryFilter[] {
  const filters: QueryFilter[] = [];
  for (const field of allowedFields) {
    const value = query[field];
    if (value === undefined || value === null || value === "") continue;
    filters.push([field, "==", value]);
  }
  return filters;
}

export async function listCollection(
  req: Request,
  res: Response,
  repo: IDataRepository,
  collection: string,
  filterFields: string[] = [],
  orderBy?: string
): Promise<void> {
  const filters = buildFilters(req.query as Record<string, unknown>, filterFields);
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const data = await repo.listDocs(collection, {
    filters,
    orderBy: orderBy || "createdAt",
    direction: "desc",
    limit
  });
  sendSuccess(res, data);
}

export async function getCollectionById(
  _req: Request,
  res: Response,
  repo: IDataRepository,
  collection: string,
  id: string
): Promise<void> {
  const data = await repo.getDoc(collection, id);
  if (!data) {
    throw new AppError(404, "NOT_FOUND", `${collection} record not found`);
  }
  sendSuccess(res, data);
}

export async function createCollectionDoc(
  req: Request,
  res: Response,
  repo: IDataRepository,
  collection: keyof typeof ID_PREFIX,
  payload: Record<string, unknown>
): Promise<void> {
  const id = (payload.id as string | undefined) || makePrefixedId(ID_PREFIX[collection]);
  await repo.setDoc(collection, id, {
    ...payload,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  sendSuccess(res, { id }, 201);
}

export async function patchCollectionDoc(
  req: Request,
  res: Response,
  repo: IDataRepository,
  collection: string,
  id: string,
  patch: Record<string, unknown>,
  auditAction?: string,
  entityType?: string
): Promise<void> {
  const before = await repo.getDoc(collection, id);
  if (!before) {
    throw new AppError(404, "NOT_FOUND", `${collection} record not found`);
  }

  await repo.updateDoc(collection, id, {
    ...patch,
    updatedAt: new Date().toISOString()
  });

  if (auditAction) {
    await repo.createAuditLog({
      actorType: req.authContext ? "user" : "system",
      actorUserId: req.authContext?.uid || null,
      actionType: auditAction,
      entityType: entityType || collection,
      entityId: id,
      summary: `${auditAction} on ${id}`,
      beforeSnapshot: before,
      afterSnapshot: patch,
      requestId: req.context.requestId,
      createdAt: new Date().toISOString()
    });
  }

  sendSuccess(res, { id });
}
