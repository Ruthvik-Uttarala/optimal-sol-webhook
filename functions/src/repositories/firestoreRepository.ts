import crypto from "node:crypto";
import admin from "firebase-admin";
import { ID_PREFIX, COLLECTIONS } from "../config/constants";
import { hashSecret } from "../utils/normalize";
import { makePrefixedId } from "../utils/id";

if (!admin.apps.length) {
  admin.initializeApp();
}

export type QueryFilter = [string, FirebaseFirestore.WhereFilterOp, unknown];

export interface ListOptions {
  filters?: QueryFilter[];
  orderBy?: string;
  direction?: "asc" | "desc";
  limit?: number;
}

export interface IDataRepository {
  getDoc<T>(collection: string, id: string): Promise<T | null>;
  setDoc<T>(collection: string, id: string, data: T, merge?: boolean): Promise<void>;
  updateDoc(collection: string, id: string, patch: Record<string, unknown>): Promise<void>;
  deleteDoc(collection: string, id: string): Promise<void>;
  listDocs<T>(collection: string, options?: ListOptions): Promise<T[]>;
  createDoc<T>(collection: keyof typeof ID_PREFIX, data: T, id?: string): Promise<T & { id: string }>;
  countDocs(collection: string, filters?: QueryFilter[]): Promise<number>;
  acquireProcessingLock(dedupeKey: string, eventId: string | null, ttlSeconds: number): Promise<{ acquired: boolean; lockId: string }>;
  releaseProcessingLock(lockId: string, status: "completed" | "failed"): Promise<void>;
  verifyApiClientSecret(type: "postman" | "unifi" | "internal", secret: string, route: string): Promise<boolean>;
  getUserAccess(uid: string): Promise<{ role: string | null; lotIds: string[]; organizationIds: string[] }>;
  createAuditLog(entry: Record<string, unknown>): Promise<string>;
}

export class FirestoreRepository implements IDataRepository {
  db: FirebaseFirestore.Firestore;

  constructor(db = admin.firestore()) {
    this.db = db;
  }

  async getDoc<T>(collection: string, id: string): Promise<T | null> {
    const snap = await this.db.collection(collection).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as object) } as T;
  }

  async setDoc<T>(collection: string, id: string, data: T, merge = true): Promise<void> {
    await this.db.collection(collection).doc(id).set(data as FirebaseFirestore.DocumentData, { merge });
  }

  async updateDoc(collection: string, id: string, patch: Record<string, unknown>): Promise<void> {
    await this.db.collection(collection).doc(id).set(patch, { merge: true });
  }

  async deleteDoc(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).delete();
  }

  async listDocs<T>(collection: string, options: ListOptions = {}): Promise<T[]> {
    let ref: FirebaseFirestore.Query = this.db.collection(collection);

    for (const [field, op, value] of options.filters || []) {
      ref = ref.where(field, op, value as never);
    }

    if (options.orderBy) {
      ref = ref.orderBy(options.orderBy, options.direction || "desc");
    }

    if (options.limit) {
      ref = ref.limit(options.limit);
    }

    const snap = await ref.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
  }

  async createDoc<T>(collection: keyof typeof ID_PREFIX, data: T, id?: string): Promise<T & { id: string }> {
    const docId = id || makePrefixedId(ID_PREFIX[collection]);
    await this.db.collection(collection).doc(docId).set(
      {
        ...(data as object),
        id: docId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return { ...(data as object), id: docId } as T & { id: string };
  }

  async countDocs(collection: string, filters: QueryFilter[] = []): Promise<number> {
    let ref: FirebaseFirestore.Query = this.db.collection(collection);
    for (const [field, op, value] of filters) {
      ref = ref.where(field, op, value as never);
    }
    const snap = await ref.count().get();
    return snap.data().count;
  }

  async acquireProcessingLock(
    dedupeKey: string,
    eventId: string | null,
    ttlSeconds: number
  ): Promise<{ acquired: boolean; lockId: string }> {
    const lockSuffix = crypto.createHash("sha1").update(dedupeKey).digest("hex");
    const lockId = `${ID_PREFIX.processingLocks}${lockSuffix}`;
    const ref = this.db.collection(COLLECTIONS.processingLocks).doc(lockId);

    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + ttlSeconds * 1000));

    const acquired = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data() || {};
        const existingExpiry = data.expiresAt?.toDate ? data.expiresAt.toDate().getTime() : 0;
        const status = data.status as string | undefined;
        if (status === "processing" && existingExpiry > Date.now()) {
          return false;
        }
      }

      tx.set(
        ref,
        {
          id: lockId,
          dedupeKey,
          eventId,
          status: "processing",
          expiresAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      return true;
    });

    return { acquired, lockId };
  }

  async releaseProcessingLock(lockId: string, status: "completed" | "failed"): Promise<void> {
    await this.updateDoc(COLLECTIONS.processingLocks, lockId, {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10_000))
    });
  }

  async verifyApiClientSecret(type: "postman" | "unifi" | "internal", secret: string, route: string): Promise<boolean> {
    if (!secret) return false;

    const secretHash = hashSecret(secret);
    const candidates = await this.listDocs<{
      id: string;
      status: string;
      secretHash: string;
      type: string;
      allowedRoutes?: string[];
    }>(COLLECTIONS.apiClients, {
      filters: [
        ["type", "==", type],
        ["status", "==", "active"],
        ["secretHash", "==", secretHash]
      ],
      limit: 5
    });

    return candidates.some((client) => {
      const routes = client.allowedRoutes || [];
      return routes.length === 0 || routes.includes(route);
    });
  }

  async getUserAccess(uid: string): Promise<{ role: string | null; lotIds: string[]; organizationIds: string[] }> {
    const profile = await this.getDoc<{ globalRole?: string }>(COLLECTIONS.users, uid);
    const accessRows = await this.listDocs<{ lotId: string; organizationId: string; status: string }>(
      COLLECTIONS.userLotAccess,
      {
        filters: [
          ["userId", "==", uid],
          ["status", "==", "active"]
        ]
      }
    );

    const lotIds = [...new Set(accessRows.map((row) => row.lotId).filter(Boolean))];
    const organizationIds = [...new Set(accessRows.map((row) => row.organizationId).filter(Boolean))];
    return {
      role: profile?.globalRole || null,
      lotIds,
      organizationIds
    };
  }

  async createAuditLog(entry: Record<string, unknown>): Promise<string> {
    const doc = await this.createDoc("auditLogs", {
      ...entry,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return doc.id;
  }
}

export class InMemoryRepository implements IDataRepository {
  private records = new Map<string, Map<string, Record<string, unknown>>>();

  private bucket(collection: string): Map<string, Record<string, unknown>> {
    if (!this.records.has(collection)) this.records.set(collection, new Map());
    return this.records.get(collection)!;
  }

  async getDoc<T>(collection: string, id: string): Promise<T | null> {
    const row = this.bucket(collection).get(id);
    return (row as T) || null;
  }

  async setDoc<T>(collection: string, id: string, data: T, merge = true): Promise<void> {
    const current = this.bucket(collection).get(id) || {};
    this.bucket(collection).set(id, merge ? { ...current, ...(data as object), id } : ({ ...(data as object), id } as Record<string, unknown>));
  }

  async updateDoc(collection: string, id: string, patch: Record<string, unknown>): Promise<void> {
    const current = this.bucket(collection).get(id) || { id };
    this.bucket(collection).set(id, { ...current, ...patch, id });
  }

  async deleteDoc(collection: string, id: string): Promise<void> {
    this.bucket(collection).delete(id);
  }

  async listDocs<T>(collection: string, options: ListOptions = {}): Promise<T[]> {
    let rows = [...this.bucket(collection).values()];

    for (const [field, op, value] of options.filters || []) {
      rows = rows.filter((row) => {
        const left = row[field];
        if (op === "==") return left === value;
        if (op === "!=") return left !== value;
        if (op === ">=") return (left as string | number) >= (value as string | number);
        if (op === "<=") return (left as string | number) <= (value as string | number);
        if (op === "in") return Array.isArray(value) && value.includes(left as never);
        return false;
      });
    }

    if (options.orderBy) {
      const field = options.orderBy;
      rows.sort((a, b) => {
        const av = a[field] as string | number | undefined;
        const bv = b[field] as string | number | undefined;
        if (av === bv) return 0;
        if (options.direction === "asc") return av! > bv! ? 1 : -1;
        return av! > bv! ? -1 : 1;
      });
    }

    if (options.limit) {
      rows = rows.slice(0, options.limit);
    }

    return rows as T[];
  }

  async createDoc<T>(collection: keyof typeof ID_PREFIX, data: T, id?: string): Promise<T & { id: string }> {
    const docId = id || makePrefixedId(ID_PREFIX[collection]);
    await this.setDoc(collection, docId, { ...(data as object), id: docId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, true);
    return { ...(data as object), id: docId } as T & { id: string };
  }

  async countDocs(collection: string, filters: QueryFilter[] = []): Promise<number> {
    const docs = await this.listDocs(collection, { filters });
    return docs.length;
  }

  async acquireProcessingLock(
    dedupeKey: string,
    eventId: string | null,
    _ttlSeconds: number
  ): Promise<{ acquired: boolean; lockId: string }> {
    const lockSuffix = crypto.createHash("sha1").update(dedupeKey).digest("hex");
    const lockId = `${ID_PREFIX.processingLocks}${lockSuffix}`;
    const row = await this.getDoc<{ status?: string; expiresAt?: string }>(COLLECTIONS.processingLocks, lockId);
    if (row?.status === "processing") return { acquired: false, lockId };
    await this.setDoc(COLLECTIONS.processingLocks, lockId, {
      id: lockId,
      dedupeKey,
      eventId,
      status: "processing",
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    });
    return { acquired: true, lockId };
  }

  async releaseProcessingLock(lockId: string, status: "completed" | "failed"): Promise<void> {
    await this.updateDoc(COLLECTIONS.processingLocks, lockId, { status, updatedAt: new Date().toISOString() });
  }

  async verifyApiClientSecret(type: "postman" | "unifi" | "internal", secret: string, route: string): Promise<boolean> {
    const clients = await this.listDocs<{ type: string; status: string; secretHash: string; allowedRoutes?: string[] }>(
      COLLECTIONS.apiClients,
      {
        filters: [
          ["type", "==", type],
          ["status", "==", "active"],
          ["secretHash", "==", hashSecret(secret)]
        ]
      }
    );
    return clients.some((client) => (client.allowedRoutes || []).length === 0 || (client.allowedRoutes || []).includes(route));
  }

  async getUserAccess(uid: string): Promise<{ role: string | null; lotIds: string[]; organizationIds: string[] }> {
    const user = await this.getDoc<{ globalRole?: string }>(COLLECTIONS.users, uid);
    const accessRows = await this.listDocs<{ lotId: string; organizationId: string; status: string }>(COLLECTIONS.userLotAccess, {
      filters: [
        ["userId", "==", uid],
        ["status", "==", "active"]
      ]
    });
    return {
      role: user?.globalRole || null,
      lotIds: [...new Set(accessRows.map((row) => row.lotId).filter(Boolean))],
      organizationIds: [...new Set(accessRows.map((row) => row.organizationId).filter(Boolean))]
    };
  }

  async createAuditLog(entry: Record<string, unknown>): Promise<string> {
    const doc = await this.createDoc("auditLogs", entry);
    return doc.id;
  }
}

export function createRepository(mode: "firestore" | "memory" = "firestore"): IDataRepository {
  return mode === "memory" ? new InMemoryRepository() : new FirestoreRepository();
}
