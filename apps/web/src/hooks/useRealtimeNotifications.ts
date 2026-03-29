import { useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firebaseDb } from "../lib/firebase";
import { useSessionStore } from "../store/useSessionStore";
import type { NotificationRecord } from "../types/app";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    return new Date(((value as { seconds: number }).seconds || 0) * 1000).toISOString();
  }
  return null;
}

function toEntityRoute(row: Record<string, unknown>) {
  if (row.linkedEntityType === "violation") {
    return `/violations/${String(row.linkedEntityId || "")}`;
  }
  if (row.linkedEntityType === "event") {
    return `/events/${String(row.linkedEntityId || "")}`;
  }
  return null;
}

function normalizeNotification(id: string, data: Record<string, unknown>): NotificationRecord {
  return {
    id,
    targetUserId: String(data.targetUserId || ""),
    title: data.title ? String(data.title) : null,
    message: data.message ? String(data.message) : null,
    type: data.type ? String(data.type) : null,
    severity: data.severity ? String(data.severity) : null,
    isRead: Boolean(data.isRead),
    readAt: toIso(data.readAt),
    linkedEntityType: data.linkedEntityType ? String(data.linkedEntityType) : null,
    linkedEntityId: data.linkedEntityId ? String(data.linkedEntityId) : null,
    entityRoute: toEntityRoute(data),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  };
}

export function useRealtimeNotifications() {
  const user = useSessionStore((state) => state.user);
  const authMode = useSessionStore((state) => state.authMode);
  const setNotifications = useSessionStore((state) => state.setNotifications);

  useEffect(() => {
    if (!user || authMode !== "firebase" || !firebaseDb) {
      setNotifications([]);
      return () => undefined;
    }

    const notificationsQuery = query(collection(firebaseDb, "notifications"), where("targetUserId", "==", user.uid));

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((doc) => normalizeNotification(doc.id, doc.data()))
          .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
        setNotifications(rows);
      },
      () => {
        setNotifications([]);
      }
    );

    return () => unsubscribe();
  }, [authMode, setNotifications, user]);
}
