import { useMemo } from "react";
import type { GlobalRole } from "../types/app";

export interface NavItem {
  to: string;
  label: string;
  roles: GlobalRole[];
}

const items: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", roles: ["operator", "admin", "manager", "support", "super_admin"] },
  { to: "/events", label: "Live Events", roles: ["operator", "admin", "support", "super_admin"] },
  { to: "/violations", label: "Violations", roles: ["operator", "admin", "manager", "support", "super_admin"] },
  { to: "/vehicles", label: "Vehicles", roles: ["operator", "admin", "manager", "support", "super_admin"] },
  { to: "/notifications", label: "Notifications", roles: ["operator", "admin", "manager", "support", "super_admin"] },
  { to: "/rules", label: "Rules", roles: ["admin", "super_admin"] },
  { to: "/users", label: "Users", roles: ["admin", "super_admin"] },
  { to: "/settings", label: "Settings", roles: ["admin", "super_admin"] },
  { to: "/system-status", label: "System Status", roles: ["admin", "manager", "support", "super_admin"] },
  { to: "/profile", label: "Profile", roles: ["operator", "admin", "manager", "support", "super_admin"] }
];

export function useRoleNavigation(role: GlobalRole | undefined): NavItem[] {
  return useMemo(() => items.filter((item) => (role ? item.roles.includes(role) : false)), [role]);
}
