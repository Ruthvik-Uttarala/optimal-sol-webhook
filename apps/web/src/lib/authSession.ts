import type { BootstrapStatus, GlobalRole, SessionProfile, SessionUser } from "../types/app";

export function isDevFallbackEnabled() {
  return String(import.meta.env.VITE_ENABLE_DEV_AUTH_FALLBACK || "").toLowerCase() === "true";
}

export function isPublicSignupEnabled() {
  return String(import.meta.env.VITE_ENABLE_PUBLIC_SIGNUP || "").toLowerCase() === "true";
}

export function getAppBaseUrl() {
  const configured = String(import.meta.env.VITE_APP_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV && typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

export function buildPasswordResetUrl() {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) return "/reset-password";
  return `${baseUrl}/reset-password`;
}

export function isOperationalUser(user: SessionUser | null | undefined) {
  return Boolean(user && user.status !== "pending_access" && user.role);
}

export function getAuthenticatedDestination(user: SessionUser | null | undefined, bootstrapStatus?: BootstrapStatus) {
  if (bootstrapStatus === "blocked" || bootstrapStatus === "unauthorized") {
    return "/unauthorized";
  }
  if (bootstrapStatus && bootstrapStatus !== "authenticated") {
    return null;
  }
  if (!user) return null;
  return isOperationalUser(user) ? "/dashboard" : "/unauthorized";
}

export function buildDevSession(email: string) {
  const role: GlobalRole = email.includes("support")
    ? "support"
    : email.includes("operator")
      ? "operator"
      : email.includes("manager")
        ? "manager"
        : "admin";

  return {
    uid: `uid_${role}_001`,
    email,
    displayName: role.toUpperCase(),
    role,
    status: "active",
    defaultLotId: "lot_demo_001",
    defaultOrganizationId: "org_demo_001",
    notificationPreferences: {
      inAppViolations: true,
      inAppSystemAlerts: true,
      inAppAssignments: true,
      soundEnabled: false,
      digestEnabled: false
    },
    access: [
      {
        id: `access_${role}_001`,
        organizationId: "org_demo_001",
        lotId: "lot_demo_001",
        roleWithinLot: role,
        status: "active"
      }
    ],
    currentLotId: "lot_demo_001",
    currentOrganizationId: "org_demo_001",
    authMode: "dev" as const
  } satisfies SessionProfile;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/user-not-found": "No account was found for that email.",
  "auth/wrong-password": "The email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account already exists for that email.",
  "auth/weak-password": "Use a stronger password with at least 6 characters.",
  "auth/network-request-failed": "Network connection lost. Please try again.",
  "auth/expired-action-code": "This reset link has expired. Request a new one.",
  "auth/invalid-action-code": "This reset link is invalid. Request a new one.",
  "auth/missing-email": "Enter the email address for the account.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
};

export function describeAuthError(error: unknown, fallback: string) {
  const code =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  return AUTH_ERROR_MESSAGES[code] || (error instanceof Error ? error.message : fallback);
}
