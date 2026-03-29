import { create } from "zustand";
import type { NotificationRecord, SessionAccess, SessionProfile, SessionUser } from "../types/app";
import { isDevFallbackEnabled } from "../lib/authSession";

const DEV_SESSION_KEY = "parking_sol_user";

function readCachedSession(): SessionProfile | null {
  if (!isDevFallbackEnabled()) return null;
  try {
    const raw = localStorage.getItem(DEV_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionProfile;
  } catch {
    return null;
  }
}

function persistCachedSession(session: SessionProfile | null) {
  if (!isDevFallbackEnabled()) return;
  if (session) {
    localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(DEV_SESSION_KEY);
  }
}

interface SessionState {
  user: SessionUser | null;
  access: SessionAccess[];
  currentLotId: string | null;
  currentOrganizationId: string | null;
  authMode: "firebase" | "dev" | "guest";
  unreadCount: number;
  notifications: NotificationRecord[];
  isBootstrapped: boolean;
  setSession: (session: SessionProfile | null) => void;
  clearSession: () => void;
  signOut: () => void;
  setUnreadCount: (count: number) => void;
  setNotifications: (notifications: NotificationRecord[]) => void;
  updateUserPreferences: (preferences: Record<string, unknown>) => void;
  setBootstrapped: (value: boolean) => void;
}

const cachedSession = readCachedSession();

export const useSessionStore = create<SessionState>((set) => ({
  user: cachedSession || null,
  access: cachedSession?.access || [],
  currentLotId: cachedSession?.currentLotId || cachedSession?.defaultLotId || null,
  currentOrganizationId: cachedSession?.currentOrganizationId || cachedSession?.defaultOrganizationId || null,
  authMode: cachedSession ? cachedSession.authMode || "dev" : "guest",
  unreadCount: 0,
  notifications: [],
  isBootstrapped: false,
  setSession: (session) => {
    if (session) {
      const nextUser: SessionUser = {
        uid: session.uid,
        email: session.email,
        displayName: session.displayName,
        role: session.role,
        status: session.status,
        defaultLotId: session.defaultLotId,
        defaultOrganizationId: session.defaultOrganizationId,
        notificationPreferences: session.notificationPreferences
      };
      set({
        user: nextUser,
        access: session.access,
        currentLotId: session.currentLotId || session.defaultLotId || session.access[0]?.lotId || null,
        currentOrganizationId: session.currentOrganizationId || session.defaultOrganizationId || session.access[0]?.organizationId || null,
        authMode: session.authMode
      });
      if (session.authMode === "firebase") {
        persistCachedSession(null);
      } else {
        persistCachedSession(session);
      }
      return;
    }

    set({
      user: null,
      access: [],
      currentLotId: null,
      currentOrganizationId: null,
      authMode: "guest",
      unreadCount: 0,
      notifications: []
    });
    persistCachedSession(null);
  },
  clearSession: () => {
    set({
      user: null,
      access: [],
      currentLotId: null,
      currentOrganizationId: null,
      authMode: "guest",
      unreadCount: 0,
      notifications: []
    });
    persistCachedSession(null);
  },
  signOut: () => {
    set({
      user: null,
      access: [],
      currentLotId: null,
      currentOrganizationId: null,
      authMode: "guest",
      unreadCount: 0,
      notifications: []
    });
    persistCachedSession(null);
  },
  setUnreadCount: (count) => set({ unreadCount: count }),
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((item) => !item.isRead).length
    }),
  updateUserPreferences: (preferences) =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            notificationPreferences: {
              ...(state.user.notificationPreferences || {}),
              ...preferences
            }
          }
        : null
    })),
  setBootstrapped: (value) => set({ isBootstrapped: value })
}));
