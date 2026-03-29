export type GlobalRole =
  | "super_admin"
  | "admin"
  | "operator"
  | "manager"
  | "support";

export type DecisionStatus =
  | "paid"
  | "unpaid"
  | "exempt"
  | "pending_review"
  | "duplicate"
  | "error";

export type ProcessingStatus =
  | "received"
  | "validated"
  | "normalized"
  | "processed"
  | "failed"
  | "duplicate_suppressed";

export type ViolationStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed"
  | "escalated";

export type Severity = "low" | "medium" | "high" | "critical";

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  meta: ApiMeta;
  error: ApiError | null;
}
