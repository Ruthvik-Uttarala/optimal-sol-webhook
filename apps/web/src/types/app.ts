export type GlobalRole = "super_admin" | "admin" | "operator" | "manager" | "support";

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: GlobalRole;
  status?: string;
  defaultLotId?: string | null;
  defaultOrganizationId?: string | null;
  notificationPreferences?: Record<string, unknown> | null;
}

export interface SessionAccess {
  id: string;
  organizationId: string | null;
  lotId: string | null;
  roleWithinLot?: string | null;
  status?: string;
}

export interface SessionProfile extends SessionUser {
  access: SessionAccess[];
  currentLotId?: string | null;
  currentOrganizationId?: string | null;
  authMode: "firebase" | "dev" | "guest";
}
