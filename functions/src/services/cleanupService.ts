import dayjs from "dayjs";
import { COLLECTIONS } from "../config/constants";
import type { IDataRepository } from "../repositories/firestoreRepository";

export async function cleanupTestArtifacts(repo: IDataRepository, retentionDays: number): Promise<{ deletedEvents: number; deletedNotifications: number; deletedAuditLogs: number }> {
  const cutoff = dayjs().subtract(retentionDays, "day").toISOString();

  const events = await repo.listDocs<{ id: string; isTestEvent?: boolean; createdAt?: string }>(COLLECTIONS.events, {
    filters: [
      ["isTestEvent", "==", true],
      ["createdAt", "<=", cutoff]
    ]
  });

  let deletedEvents = 0;
  for (const event of events) {
    await repo.deleteDoc(COLLECTIONS.events, event.id);
    deletedEvents += 1;
  }

  const notifications = await repo.listDocs<{ id: string; createdAt?: string; type?: string }>(COLLECTIONS.notifications, {
    filters: [["createdAt", "<=", cutoff]]
  });

  let deletedNotifications = 0;
  for (const notification of notifications) {
    await repo.deleteDoc(COLLECTIONS.notifications, notification.id);
    deletedNotifications += 1;
  }

  const auditLogs = await repo.listDocs<{ id: string; createdAt?: string }>(COLLECTIONS.auditLogs, {
    filters: [["createdAt", "<=", cutoff]]
  });

  let deletedAuditLogs = 0;
  for (const audit of auditLogs) {
    await repo.deleteDoc(COLLECTIONS.auditLogs, audit.id);
    deletedAuditLogs += 1;
  }

  return { deletedEvents, deletedNotifications, deletedAuditLogs };
}
