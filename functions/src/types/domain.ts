export type GlobalRole = "super_admin" | "admin" | "operator" | "manager" | "support";

export interface AuthContext {
  uid: string;
  email: string | null;
  role: GlobalRole | null;
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

export type EventSourceType = "postman" | "unifi_webhook" | "manual" | "import" | "webcam_lpr" | "local_lpr";

export interface EventEvidenceRef {
  kind?: string | null;
  label?: string | null;
  path?: string | null;
  url?: string | null;
  contentType?: string | null;
  capturedAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EventPayload {
  sourceKey: string;
  externalEventId?: string | null;
  localEventId?: string | null;
  eventSource?: string | null;
  sourceType?: EventSourceType | null;
  eventType?: "plate_detected" | "entry" | "exit" | "unknown";
  capturedAt: string;
  plate: string;
  normalizedPlate?: string | null;
  plateConfidence?: number | null;
  detectorConfidence?: number | null;
  cameraLabel?: string | null;
  cameraName?: string | null;
  cameraId?: string | null;
  direction?: "entry" | "exit" | "unknown";
  frameConsensusCount?: number | null;
  evidenceRefs?: EventEvidenceRef[] | null;
  recognitionMetadata?: Record<string, unknown> | null;
  lprModelInfo?: Record<string, unknown> | null;
  webhookDelivery?: Record<string, unknown> | null;
  manualReviewRequired?: boolean | null;
  demoSessionId?: string | null;
  demoMode?: boolean | null;
  sessionKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NormalizedEvent {
  organizationId: string;
  lotId: string;
  sourceId: string;
  sourceType: EventSourceType;
  externalEventId: string | null;
  localEventId: string | null;
  eventSource: string | null;
  eventType: "plate_detected" | "entry" | "exit" | "unknown";
  sourceDirection: "entry" | "exit" | "unknown";
  plate: string;
  normalizedPlate: string;
  plateConfidence: number | null;
  detectorConfidence: number | null;
  cameraLabel: string | null;
  cameraName: string | null;
  cameraId: string | null;
  frameConsensusCount: number | null;
  evidenceRefs: EventEvidenceRef[];
  recognitionMetadata: Record<string, unknown> | null;
  lprModelInfo: Record<string, unknown> | null;
  webhookDelivery: Record<string, unknown> | null;
  manualReviewRequired: boolean;
  demoSessionId: string | null;
  demoMode: boolean;
  sessionKey: string | null;
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
