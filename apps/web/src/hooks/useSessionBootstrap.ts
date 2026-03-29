import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { api } from "../services/api";
import { useSessionStore } from "../store/useSessionStore";
import type { SessionAccess, SessionProfile } from "../types/app";

function isDevFallbackEnabled() {
  const envLabel = (import.meta.env.VITE_ENV_LABEL || "").toLowerCase();
  return import.meta.env.DEV || envLabel.includes("test") || envLabel.includes("dev") || envLabel.includes("preview");
}

function readStoredFallback(): SessionProfile | null {
  if (!isDevFallbackEnabled()) return null;
  try {
    const raw = localStorage.getItem("parking_sol_user");
    if (!raw) return null;
    return JSON.parse(raw) as SessionProfile;
  } catch {
    return null;
  }
}

function makeFallbackSession(): SessionProfile | null {
  return readStoredFallback();
}

function mapFirebaseProfile(
  me: Record<string, unknown>,
  access: SessionAccess[],
  email: string
): SessionProfile {
  const accessContext = (me.accessContext as Record<string, unknown> | undefined) || {};
  const defaultLotId =
    (accessContext.defaultLotId as string | null | undefined) ||
    (me.defaultLotId as string | null | undefined) ||
    access[0]?.lotId ||
    null;
  const defaultOrganizationId =
    (accessContext.defaultOrganizationId as string | null | undefined) ||
    (me.defaultOrganizationId as string | null | undefined) ||
    access[0]?.organizationId ||
    null;
  return {
    uid: String(me.id || me.uid || ""),
    email,
    displayName: String(me.displayName || me.email || email || "User"),
    role: String(me.role || me.globalRole || "operator") as SessionProfile["role"],
    status: String(me.status || "active"),
    defaultLotId,
    defaultOrganizationId,
    notificationPreferences: (me.notificationPreferences as Record<string, unknown> | null) || null,
    access,
    currentLotId: defaultLotId,
    currentOrganizationId: defaultOrganizationId,
    authMode: "firebase"
  };
}

export function useSessionBootstrap() {
  const existingUser = useSessionStore((state) => state.user);
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setBootstrapped = useSessionStore((state) => state.setBootstrapped);

  useEffect(() => {
    let active = true;

    if (!firebaseAuth) {
      if (existingUser) {
        setBootstrapped(true);
        return () => {
          active = false;
        };
      }

      const fallback = makeFallbackSession();
      if (fallback) {
        setSession(fallback);
        setBootstrapped(true);
      } else {
        setBootstrapped(true);
      }
      return () => {
        active = false;
      };
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (authUser) => {
      try {
        if (!active) return;
        if (!authUser) {
          if (useSessionStore.getState().user) {
            setBootstrapped(true);
            return;
          }
          const fallback = makeFallbackSession();
          if (fallback) {
            setSession(fallback);
            setBootstrapped(true);
          } else {
            setBootstrapped(true);
          }
          return;
        }

        const [meResponse, accessResponse] = await Promise.all([api.get("/me"), api.get("/me/access")]);
        const accessPayload = accessResponse.data.data;
        const accessItems = Array.isArray(accessPayload)
          ? accessPayload
          : Array.isArray(accessPayload?.items)
            ? accessPayload.items
            : [];
        const profile = mapFirebaseProfile(
          meResponse.data.data || {},
          accessItems as SessionAccess[],
          authUser.email || ""
        );
        profile.uid = authUser.uid;
        profile.email = authUser.email || profile.email;
        profile.displayName = String(meResponse.data.data?.displayName || authUser.displayName || profile.email || "User");
        setSession(profile);
      } catch {
        const fallback = makeFallbackSession();
        if (fallback) {
          setSession(fallback);
        } else {
          clearSession();
        }
      } finally {
        if (active) setBootstrapped(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [clearSession, setBootstrapped, setSession]);
}
