import type { GlobalRole } from "../types/domain";

export const COLLECTIONS = {
  organizations: "organizations",
  lots: "lots",
  users: "users",
  userLotAccess: "userLotAccess",
  sources: "sources",
  rules: "rules",
  payments: "payments",
  permits: "permits",
  events: "events",
  vehicleStates: "vehicleStates",
  parkingSessions: "parkingSessions",
  violations: "violations",
  notifications: "notifications",
  auditLogs: "auditLogs",
  systemConfig: "systemConfig",
  apiClients: "apiClients",
  processingLocks: "processingLocks"
} as const;

export const ID_PREFIX = {
  organizations: "org_",
  lots: "lot_",
  sources: "src_",
  rules: "rule_",
  payments: "pay_",
  permits: "permit_",
  events: "evt_",
  vehicleStates: "veh_",
  parkingSessions: "ses_",
  violations: "vio_",
  notifications: "noti_",
  auditLogs: "audit_",
  apiClients: "client_",
  processingLocks: "lock_"
} as const;

export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_EVENT: "DUPLICATE_EVENT",
  SOURCE_INACTIVE: "SOURCE_INACTIVE",
  LOT_INACTIVE: "LOT_INACTIVE",
  RULE_CONFLICT: "RULE_CONFLICT",
  PAYMENT_NOT_FOUND: "PAYMENT_NOT_FOUND",
  VIOLATION_STATE_INVALID: "VIOLATION_STATE_INVALID",
  TEST_MODE_ONLY: "TEST_MODE_ONLY",
  PROCESSING_LOCK_EXISTS: "PROCESSING_LOCK_EXISTS",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export const ALL_ROLES: GlobalRole[] = ["super_admin", "admin", "operator", "manager", "support"];

export const ROLE_PRIORITY: Record<GlobalRole, number> = {
  super_admin: 5,
  admin: 4,
  manager: 3,
  operator: 2,
  support: 1
};

export const SYSTEM_CONFIG_DOC = "global";

export const TEST_RETENTION_DAYS_DEFAULT = 14;

export const API_BASE = "/api/v1";
