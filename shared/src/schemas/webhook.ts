import { z } from "zod";

export const postmanEventSchema = z.object({
  sourceKey: z.string().min(1),
  externalEventId: z.string().optional().nullable(),
  eventType: z.enum(["entry", "exit", "plate_detected", "unknown"]).optional(),
  capturedAt: z.string().datetime(),
  plate: z.string().min(1),
  plateConfidence: z.number().min(0).max(1).optional().nullable(),
  cameraLabel: z.string().optional().nullable(),
  direction: z.enum(["entry", "exit", "unknown"]).optional(),
  metadata: z.record(z.any()).optional()
});

export type PostmanEventPayload = z.infer<typeof postmanEventSchema>;
