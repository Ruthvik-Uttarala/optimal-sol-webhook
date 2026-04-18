import { z } from "zod";

export const eventSourceTypeSchema = z.enum(["postman", "unifi_webhook", "manual", "import", "webcam_lpr", "local_lpr"]);

export const evidenceRefSchema = z.object({
  kind: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  path: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  contentType: z.string().optional().nullable(),
  capturedAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.any()).optional()
});

export const ingestPayloadSchema = z.object({
  sourceKey: z.string().min(1),
  externalEventId: z.string().optional().nullable(),
  localEventId: z.string().optional().nullable(),
  eventSource: z.string().optional().nullable(),
  sourceType: eventSourceTypeSchema.optional().nullable(),
  eventType: z.enum(["entry", "exit", "plate_detected", "unknown"]).optional(),
  capturedAt: z.string().datetime(),
  plate: z.string().min(1),
  normalizedPlate: z.string().optional().nullable(),
  plateConfidence: z.number().min(0).max(1).optional().nullable(),
  detectorConfidence: z.number().min(0).max(1).optional().nullable(),
  cameraLabel: z.string().optional().nullable(),
  cameraName: z.string().optional().nullable(),
  cameraId: z.string().optional().nullable(),
  direction: z.enum(["entry", "exit", "unknown"]).optional(),
  frameConsensusCount: z.number().int().min(1).optional().nullable(),
  evidenceRefs: z.array(evidenceRefSchema).optional().nullable(),
  recognitionMetadata: z.record(z.any()).optional().nullable(),
  lprModelInfo: z.record(z.any()).optional().nullable(),
  webhookDelivery: z.record(z.any()).optional().nullable(),
  manualReviewRequired: z.boolean().optional().nullable(),
  demoSessionId: z.string().optional().nullable(),
  demoMode: z.boolean().optional().nullable(),
  sessionKey: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional()
});

export const lprIngestPayloadSchema = ingestPayloadSchema.extend({
  externalEventId: z.string().min(1),
  eventSource: z.string().min(1).default("lpr"),
  sourceType: eventSourceTypeSchema.default("webcam_lpr"),
  plateConfidence: z.number().min(0).max(1),
  cameraName: z.string().optional().nullable(),
  cameraId: z.string().optional().nullable(),
  detectorConfidence: z.number().min(0).max(1).optional().nullable(),
  manualReviewRequired: z.boolean().optional().default(false)
});

export const updatePreferencesSchema = z.object({
  inAppViolations: z.boolean().optional(),
  inAppSystemAlerts: z.boolean().optional(),
  inAppAssignments: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional()
});

export const assignViolationSchema = z.object({
  assignedToUserId: z.string().min(1)
});

export const resolveViolationSchema = z.object({
  reason: z.string().min(1),
  notes: z.string().optional().nullable()
});

export const dismissViolationSchema = z.object({
  reason: z.string().min(1)
});

export const createPaymentSchema = z.object({
  lotId: z.string().min(1),
  plate: z.string().min(1),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  paymentType: z.enum(["hourly", "daily", "monthly", "manual_override"]).default("manual_override"),
  source: z.enum(["manual", "import", "external_provider"]).default("manual")
});

export const createPermitSchema = z.object({
  lotId: z.string().min(1),
  plate: z.string().min(1),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  permitType: z.enum(["resident", "staff", "guest", "vendor", "allowlist"]).default("allowlist")
});

export const createRuleSchema = z.object({
  lotId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  type: z.enum([
    "grace_period",
    "allowlist",
    "permit_policy",
    "duplicate_window",
    "enforcement_hours",
    "violation_threshold",
    "notification_routing",
    "custom_flag"
  ]),
  status: z.enum(["active", "inactive", "draft"]).default("active"),
  priority: z.number().int().default(100),
  conditions: z.record(z.any()).default({}),
  actions: z.record(z.any()).default({})
});

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  globalRole: z.enum(["super_admin", "admin", "operator", "manager", "support"]),
  defaultOrganizationId: z.string().optional().nullable(),
  defaultLotId: z.string().optional().nullable()
});

export const createAccessSchema = z.object({
  organizationId: z.string().min(1),
  lotId: z.string().min(1),
  roleWithinLot: z.enum(["admin", "operator", "manager", "support"])
});

export const createLotSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  timezone: z.string().default("America/New_York"),
  status: z.enum(["active", "inactive"]).default("active")
});

export const createSourceSchema = z.object({
  organizationId: z.string().min(1),
  lotId: z.string().min(1),
  name: z.string().min(1),
  sourceKey: z.string().min(1),
  type: eventSourceTypeSchema.default("postman"),
  status: z.enum(["active", "inactive"]).default("active"),
  directionMode: z.enum(["entry", "exit", "bidirectional", "unknown"]).default("bidirectional"),
  cameraLabel: z.string().optional().nullable(),
  cameraName: z.string().optional().nullable(),
  cameraId: z.string().optional().nullable(),
  laneLabel: z.string().optional().nullable(),
  sharedSecretId: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional(),
  demoMode: z.boolean().optional()
});

export const markReadSchema = z.object({
  read: z.boolean().default(true)
});

export const patchVehicleFlagsSchema = z.object({
  flags: z.array(z.string()).default([]),
  notesSummary: z.string().optional().nullable()
});

export const patchSystemConfigSchema = z.object({
  environmentLabel: z.string().optional(),
  timezone: z.string().optional(),
  notificationDefaults: z.record(z.any()).optional(),
  sourceMetadataDefaults: z.record(z.any()).optional(),
  supportModeEnabled: z.boolean().optional(),
  testModeEnabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).optional()
});
