import { useEffect } from "react";
import axios from "axios";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { isDevFallbackEnabled } from "../lib/authSession";
import { api } from "../services/api";
import { useSessionStore } from "../store/useSessionStore";
import type { BootstrapStatus, SessionAccess, SessionProfile } from "../types/app";

const SESSION_BOOTSTRAP_TIMEOUT_MS = 12000;

class SessionBootstrapFailure extends Error {
  status: BootstrapStatus;
  code: string | null;

  constructor(status: BootstrapStatus, message: string, code?: string | null) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
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

function buildIdentitySession(uid: string, email: string, displayName?: string | null): SessionProfile {
  return {
    uid,
    email,
    displayName: displayName || email || "User",
    role: null,
    status: "pending_access",
    defaultLotId: null,
    defaultOrganizationId: null,
    notificationPreferences: null,
    access: [],
    currentLotId: null,
    currentOrganizationId: null,
    authMode: "firebase"
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new SessionBootstrapFailure("error", message, "BOOTSTRAP_TIMEOUT"));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeScopePayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return {
      accessRecords: payload as SessionAccess[],
      hasActiveScope: payload.some((item) => Boolean(item?.lotId && item?.organizationId))
    };
  }

  const data = (payload || {}) as Record<string, unknown>;
  const accessRecords = Array.isArray(data.accessRecords)
    ? (data.accessRecords as SessionAccess[])
    : Array.isArray(data.items)
      ? (data.items as SessionAccess[])
      : [];

  return {
    accessRecords,
    effectiveRole: (data.effectiveRole || null) as SessionProfile["role"],
    status: typeof data.status === "string" ? data.status : null,
    hasActiveScope:
      typeof data.hasActiveScope === "boolean"
        ? data.hasActiveScope
        : accessRecords.some((item) => Boolean(item?.lotId && item?.organizationId)),
    resolvedLotId: typeof data.resolvedLotId === "string" ? data.resolvedLotId : null,
    resolvedOrganizationId: typeof data.resolvedOrganizationId === "string" ? data.resolvedOrganizationId : null,
    defaultLotId: typeof data.defaultLotId === "string" ? data.defaultLotId : null,
    defaultOrganizationId: typeof data.defaultOrganizationId === "string" ? data.defaultOrganizationId : null,
    blockedReason: typeof data.blockedReason === "string" ? data.blockedReason : null
  };
}

function mapFirebaseProfile(
  me: Record<string, unknown>,
  scope: ReturnType<typeof normalizeScopePayload>,
  email: string,
  previousLotId: string | null,
  previousOrganizationId: string | null
): SessionProfile {
  const access = scope.accessRecords;
  const accessContext = (me.accessContext as Record<string, unknown> | undefined) || {};
  const defaultLotId =
    scope.defaultLotId ||
    scope.resolvedLotId ||
    (accessContext.resolvedLotId as string | null | undefined) ||
    (accessContext.defaultLotId as string | null | undefined) ||
    (me.defaultLotId as string | null | undefined) ||
    access[0]?.lotId ||
    null;
  const defaultOrganizationId =
    scope.defaultOrganizationId ||
    scope.resolvedOrganizationId ||
    (accessContext.resolvedOrganizationId as string | null | undefined) ||
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
    role: (scope.effectiveRole || me.role || me.globalRole || null) as SessionProfile["role"],
    status: String(scope.status || me.status || ((me.role || me.globalRole) ? "active" : "pending_access")),
    defaultLotId,
    defaultOrganizationId,
    notificationPreferences: (me.notificationPreferences as Record<string, unknown> | null) || null,
    access,
    currentLotId,
    currentOrganizationId,
    authMode: "firebase"
  };
}

function getResolutionStatus(profile: SessionProfile, scope: ReturnType<typeof normalizeScopePayload>) {
  if (profile.status === "disabled") {
    return {
      status: "unauthorized" as const,
      message: "This account is disabled.",
      code: "USER_DISABLED"
    };
  }

  if (profile.status === "pending_access" || !profile.role) {
    return {
      status: "unauthorized" as const,
      message: "This account is signed in but still awaiting operational access.",
      code: "PENDING_ACCESS"
    };
  }

  if (profile.role !== "super_admin" && !scope.hasActiveScope) {
    return {
      status: "blocked" as const,
      message: "This account is active, but no valid lot scope is configured yet.",
      code: scope.blockedReason || "NO_ACTIVE_SCOPE"
    };
  }

  return {
    status: "authenticated" as const,
    message: null,
    code: null
  };
}

function classifyBootstrapFailure(error: unknown) {
  if (error instanceof SessionBootstrapFailure) {
    return {
      status: error.status,
      message: error.message,
      code: error.code
    };
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const errorBody = (error.response?.data?.error || {}) as Record<string, unknown>;
    const code = typeof errorBody.code === "string" ? errorBody.code : error.code || "REQUEST_FAILED";
    const message =
      (typeof errorBody.message === "string" && errorBody.message) ||
      error.message ||
      "Unable to load the current session.";

    if (status === 401) {
      return { status: "unauthorized" as const, message, code };
    }

    if (status === 403) {
      return {
        status: code === "NO_ACTIVE_SCOPE" ? ("blocked" as const) : ("unauthorized" as const),
        message,
        code
      };
    }

    return { status: "error" as const, message, code };
  }

  return {
    status: "error" as const,
    message: error instanceof Error ? error.message : "Unable to load the current session.",
    code: "BOOTSTRAP_FAILED"
  };
}

export function useSessionBootstrap() {
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setBootstrapState = useSessionStore((state) => state.setBootstrapState);

  useEffect(() => {
    let active = true;
    setBootstrapState("loading");

    if (!firebaseAuth) {
      if (useSessionStore.getState().user) {
        setBootstrapState("authenticated");
        return () => {
          active = false;
        };
      }

      const fallback = makeFallbackSession();
      if (fallback) {
        setSession(fallback);
        setBootstrapState("authenticated");
      } else {
        clearSession();
        setBootstrapState("idle");
      }
      return () => {
        active = false;
      };
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (authUser) => {
      if (!active) return;
      setBootstrapState("loading");

      try {
        if (!authUser) {
          const fallback = makeFallbackSession();
          if (fallback) {
            setSession(fallback);
            setBootstrapState("authenticated");
          } else {
            clearSession();
            setBootstrapState("idle");
          }
          return;
        }

        const { currentLotId, currentOrganizationId } = useSessionStore.getState();
        const [meResponse, accessResponse] = await withTimeout(
          Promise.all([api.get("/me"), api.get("/me/access")]),
          SESSION_BOOTSTRAP_TIMEOUT_MS,
          "Session bootstrap timed out while loading your profile."
        );
        const mePayload = meResponse.data?.data;
        if (!mePayload || typeof mePayload !== "object") {
          throw new SessionBootstrapFailure("error", "Current user profile response was invalid.", "INVALID_ME_PAYLOAD");
        }
        const scope = normalizeScopePayload(accessResponse.data?.data);
        const profile = mapFirebaseProfile(
          mePayload as Record<string, unknown>,
          scope,
          authUser.email || "",
          currentLotId,
          currentOrganizationId
        );
        profile.uid = authUser.uid;
        profile.email = authUser.email || profile.email;
        profile.displayName = String((mePayload as Record<string, unknown>).displayName || authUser.displayName || profile.email || "User");
        setSession(profile);
        const resolution = getResolutionStatus(profile, scope);
        setBootstrapState(resolution.status, {
          message: resolution.message,
          code: resolution.code
        });
      } catch (error) {
        const failure = classifyBootstrapFailure(error);
        const currentAuthUser = firebaseAuth?.currentUser || null;
        if (currentAuthUser) {
          setSession(buildIdentitySession(currentAuthUser.uid, currentAuthUser.email || "", currentAuthUser.displayName));
        } else {
          clearSession();
        }
        if (active) {
          setBootstrapState(failure.status, {
            message: failure.message,
            code: failure.code
          });
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [clearSession, setBootstrapState, setSession]);
}
