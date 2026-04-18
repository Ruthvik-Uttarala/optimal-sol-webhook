import { z } from "zod";

export const eventSourceTypeSchema = z.enum(["postman", "unifi_webhook", "manual", "import", "webcam_lpr", "local_lpr"]);

export const webhookEvidenceRefSchema = z.object({
  kind: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  path: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  contentType: z.string().optional().nullable(),
  capturedAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.any()).optional()
});

const baseEventSchema = z.object({
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
  evidenceRefs: z.array(webhookEvidenceRefSchema).optional().nullable(),
  recognitionMetadata: z.record(z.any()).optional().nullable(),
  lprModelInfo: z.record(z.any()).optional().nullable(),
  webhookDelivery: z.record(z.any()).optional().nullable(),
  manualReviewRequired: z.boolean().optional().nullable(),
  demoSessionId: z.string().optional().nullable(),
  demoMode: z.boolean().optional().nullable(),
  sessionKey: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional()
});

export const postmanEventSchema = baseEventSchema;
export const lprEventSchema = baseEventSchema.extend({
  externalEventId: z.string().min(1),
  eventSource: z.string().min(1).default("lpr"),
  sourceType: eventSourceTypeSchema.default("webcam_lpr"),
  plateConfidence: z.number().min(0).max(1),
  manualReviewRequired: z.boolean().optional().default(false)
});

export type PostmanEventPayload = z.infer<typeof postmanEventSchema>;
export type LprEventPayload = z.infer<typeof lprEventSchema>;
