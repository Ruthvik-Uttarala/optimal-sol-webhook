import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { isDevFallbackEnabled } from "../lib/authSession";
import { api } from "../services/api";
import { useSessionStore } from "../store/useSessionStore";
import type { SessionAccess, SessionProfile } from "../types/app";

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
  email: string,
  previousLotId: string | null,
  previousOrganizationId: string | null
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
  const currentLotId =
    (previousLotId && access.some((item) => item.lotId === previousLotId) && previousLotId) ||
    defaultLotId;
  const currentOrganizationId =
    (previousOrganizationId &&
      access.some((item) => item.organizationId === previousOrganizationId) &&
      previousOrganizationId) ||
    defaultOrganizationId;
  return {
    uid: String(me.id || me.uid || ""),
    email,
    displayName: String(me.displayName || me.email || email || "User"),
    role: (me.role || me.globalRole || null) as SessionProfile["role"],
    status: String(me.status || ((me.role || me.globalRole) ? "active" : "pending_access")),
    defaultLotId,
    defaultOrganizationId,
    notificationPreferences: (me.notificationPreferences as Record<string, unknown> | null) || null,
    access,
    currentLotId,
    currentOrganizationId,
    authMode: "firebase"
  };
}

export function useSessionBootstrap() {
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setBootstrapped = useSessionStore((state) => state.setBootstrapped);

  useEffect(() => {
    let active = true;
    setBootstrapped(false);

    if (!firebaseAuth) {
      if (useSessionStore.getState().user) {
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
      if (!active) return;
      setBootstrapped(false);

      try {
        if (!authUser) {
          if (useSessionStore.getState().authMode === "firebase") {
            clearSession();
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

        const { currentLotId, currentOrganizationId } = useSessionStore.getState();
        const meResponse = await api.get("/me");
        const accessResponse = await api.get("/me/access");
        const accessPayload = accessResponse.data.data;
        const accessItems = Array.isArray(accessPayload)
          ? accessPayload
          : Array.isArray(accessPayload?.items)
            ? accessPayload.items
            : Array.isArray(accessPayload?.accessRecords)
              ? accessPayload.accessRecords
            : [];
        const profile = mapFirebaseProfile(
          meResponse.data.data || {},
          accessItems as SessionAccess[],
          authUser.email || "",
          currentLotId,
          currentOrganizationId
        );
        profile.uid = authUser.uid;
        profile.email = authUser.email || profile.email;
        profile.displayName = String(meResponse.data.data?.displayName || authUser.displayName || profile.email || "User");
        setSession(profile);
      } catch {
        const fallback = makeFallbackSession();
        if (fallback && useSessionStore.getState().authMode !== "firebase") {
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
