export type GlobalRole = "super_admin" | "admin" | "operator" | "manager" | "support";

export interface AuthContext {
  uid: string;
  email: string | null;
  role: GlobalRole;
  organizationIds: string[];
  lotIds: string[];
}

export interface RequestContext {
  requestId: string;
  receivedAtIso: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface EventPayload {
  sourceKey: string;
  externalEventId?: string | null;
  eventType?: "plate_detected" | "entry" | "exit" | "unknown";
  capturedAt: string;
  plate: string;
  plateConfidence?: number | null;
  cameraLabel?: string | null;
  direction?: "entry" | "exit" | "unknown";
  metadata?: Record<string, unknown>;
}

export interface NormalizedEvent {
  organizationId: string;
  lotId: string;
  sourceId: string;
  externalEventId: string | null;
  eventType: "plate_detected" | "entry" | "exit" | "unknown";
  sourceDirection: "entry" | "exit" | "unknown";
  plate: string;
  normalizedPlate: string;
  plateConfidence: number | null;
  capturedAt: string;
  receivedAt: string;
  isTestEvent: boolean;
}

export interface EventProcessResult {
  eventId: string;
  decisionStatus: "paid" | "unpaid" | "exempt" | "pending_review" | "duplicate" | "error";
  processingStatus: "processed" | "failed" | "duplicate_suppressed";
  violationId: string | null;
  notificationIds: string[];
  reasonCodes: string[];
}
