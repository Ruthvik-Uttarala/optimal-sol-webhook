import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS, ERROR_CODES } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { AppError } from "../utils/errors";
import { processIncomingEvent, reprocessEvent } from "../services/eventProcessingService";
import { getLprClientSecret, getPostmanClientSecret } from "../config/env";
import { assertLotAccess, listScopedDocs, loadScopedDocById } from "../utils/access";
import { ingestPayloadSchema, lprIngestPayloadSchema } from "../schemas/contracts";

function normalizeLprSourceType(value: unknown) {
  return value === "local_lpr" ? "webcam_lpr" : value;
}

export function createEventsController(repo: IDataRepository) {
  return {
    ingestPostman: async (req: Request, res: Response): Promise<void> => {
      const secret = req.header("x-api-client-secret") || "";
      const envSecret = getPostmanClientSecret();
      const verifiedByClient = await repo.verifyApiClientSecret("postman", secret, "/api/v1/webhooks/postman/events");
      if (!(verifiedByClient || (envSecret && secret === envSecret))) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid API client secret");
      }

      const result = await processIncomingEvent(repo, req.body, {
        actorUserId: null,
        via: "postman",
        requestId: req.context.requestId
      });
      sendSuccess(res, result, 201);
    },

    ingestUnifi: async (req: Request, res: Response): Promise<void> => {
      const secret = req.header("x-api-client-secret") || "";
      const verifiedByClient = await repo.verifyApiClientSecret("unifi", secret, "/api/v1/webhooks/unifi/events");
      if (!verifiedByClient) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid API client secret");
      }

      const mappedBody = {
        sourceKey: req.body.sourceKey || "unifi-main-gate",
        externalEventId: req.body.externalEventId || req.body.eventId || null,
        eventType: req.body.eventType || (req.body.direction === "exit" ? "exit" : "entry"),
        capturedAt: req.body.capturedAt || req.body.timestamp || new Date().toISOString(),
        plate: req.body.plate || req.body.licensePlate || "",
        plateConfidence: req.body.plateConfidence ?? req.body.confidence ?? null,
        cameraLabel: req.body.cameraLabel || req.body.cameraName || null,
        direction: req.body.direction || "unknown",
        metadata: req.body.metadata || req.body
      };
      const parsed = ingestPayloadSchema.safeParse(mappedBody);
      if (!parsed.success) {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message || "Invalid UniFi payload");
      }

      const result = await processIncomingEvent(repo, parsed.data, {
        actorUserId: null,
        via: "unifi",
        requestId: req.context.requestId
      });
      sendSuccess(res, result, 201);
    },

    ingestLpr: async (req: Request, res: Response): Promise<void> => {
      const secret = req.header("x-api-client-secret") || "";
      const envSecret = getLprClientSecret();
      const verifiedByClient = await repo.verifyApiClientSecret("lpr", secret, "/api/v1/webhooks/lpr/events");
      if (!(verifiedByClient || (envSecret && secret === envSecret))) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid API client secret");
      }

      const mappedBody = {
        ...req.body,
        sourceType: normalizeLprSourceType(req.body.sourceType ?? "webcam_lpr"),
        eventSource: req.body.eventSource || "lpr",
        eventType: req.body.eventType || "plate_detected",
        direction: req.body.direction || "unknown",
        cameraLabel: req.body.cameraLabel || req.body.cameraName || null,
        metadata: req.body.metadata || req.body.rawMetadata || {}
      };
      const parsed = lprIngestPayloadSchema.safeParse(mappedBody);
      if (!parsed.success) {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message || "Invalid LPR payload");
      }

      const result = await processIncomingEvent(repo, parsed.data, {
        actorUserId: null,
        via: "lpr",
        requestId: req.context.requestId
      });
      sendSuccess(res, result, 201);
    },

    manualEvent: async (req: Request, res: Response): Promise<void> => {
      const result = await processIncomingEvent(repo, req.body, {
        actorUserId: req.authContext?.uid || null,
        via: "manual",
        requestId: req.context.requestId
      });
      sendSuccess(res, result, 201);
    },

    listEvents: async (req: Request, res: Response): Promise<void> => {
      const filters: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [];
      for (const key of ["lotId", "decisionStatus", "processingStatus", "sourceId"]) {
        const value = req.query[key];
        if (value) filters.push([key, "==", value]);
      }
      if (req.query.plate) {
        filters.push(["normalizedPlate", "==", String(req.query.plate).toUpperCase()]);
      }

      const data = await listScopedDocs(repo, COLLECTIONS.events, req.authContext, {
        filters,
        orderBy: "capturedAt",
        direction: "desc",
        limit: req.query.limit ? Number(req.query.limit) : 50
      });
      const sourceIds = [...new Set(data.map((row: Record<string, unknown>) => String(row.sourceId || "")).filter(Boolean))];
      const sources = await Promise.all(sourceIds.map((sourceId) => repo.getDoc<Record<string, unknown>>(COLLECTIONS.sources, sourceId)));
      const sourceMap = new Map(sources.filter(Boolean).map((row) => [String(row?.id), row as Record<string, unknown>]));

      sendSuccess(
        res,
        data.map((row: Record<string, unknown>) => ({
          ...row,
          sourceType: row.sourceType || sourceMap.get(String(row.sourceId || ""))?.type || null,
          sourceName: sourceMap.get(String(row.sourceId || ""))?.name || row.sourceId || null,
          cameraName: row.cameraName || (row.rawPayload as Record<string, unknown> | undefined)?.cameraName || null,
          cameraId: row.cameraId || (row.rawPayload as Record<string, unknown> | undefined)?.cameraId || null,
          cameraLabel: row.cameraLabel || (row.rawPayload as Record<string, unknown> | undefined)?.cameraLabel || null,
          confidence: row.plateConfidence ?? null,
          detectorConfidence: row.detectorConfidence ?? null,
          frameConsensusCount: row.frameConsensusCount ?? null,
          manualReviewRequired: Boolean(row.manualReviewRequired),
          evidenceCount: Array.isArray(row.evidenceRefs) ? row.evidenceRefs.length : 0,
          hasViolation: Boolean(row.violationId)
        }))
      );
    },

    getEvent: async (req: Request, res: Response): Promise<void> => {
      const event = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.events, req.authContext, String(req.params.eventId));
      if (!event) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
      assertLotAccess(req.authContext, String(event.lotId || null), "Lot scope denied");

      const [source, violation, vehicleState, parkingSession] = await Promise.all([
        event.sourceId ? repo.getDoc<Record<string, unknown>>(COLLECTIONS.sources, String(event.sourceId)) : Promise.resolve(null),
        event.violationId ? repo.getDoc<Record<string, unknown>>(COLLECTIONS.violations, String(event.violationId)) : Promise.resolve(null),
        event.vehicleStateId ? repo.getDoc<Record<string, unknown>>(COLLECTIONS.vehicleStates, String(event.vehicleStateId)) : Promise.resolve(null),
        event.parkingSessionId ? repo.getDoc<Record<string, unknown>>(COLLECTIONS.parkingSessions, String(event.parkingSessionId)) : Promise.resolve(null)
      ]);

      sendSuccess(res, {
        ...event,
        sourceType: event.sourceType || source?.type || null,
        sourceName: source?.name || event.sourceId || null,
        cameraLabel: event.cameraLabel || (event.rawPayload as Record<string, unknown> | undefined)?.cameraLabel || null,
        cameraName: event.cameraName || (event.rawPayload as Record<string, unknown> | undefined)?.cameraName || null,
        cameraId: event.cameraId || (event.rawPayload as Record<string, unknown> | undefined)?.cameraId || null,
        detectorConfidence: event.detectorConfidence ?? null,
        frameConsensusCount: event.frameConsensusCount ?? null,
        manualReviewRequired: Boolean(event.manualReviewRequired),
        evidenceRefs: event.evidenceRefs || [],
        recognitionMetadata: event.recognitionMetadata || null,
        lprModelInfo: event.lprModelInfo || null,
        webhookDelivery: event.webhookDelivery || (event.sourceType === "webcam_lpr" ? { status: "received" } : null),
        demoSessionId: event.demoSessionId || null,
        demoMode: Boolean(event.demoMode),
        debug: {
          rawPayloadHash: event.rawPayloadHash || null,
          errorCode: event.errorCode || null,
          errorMessage: event.errorMessage || null
        },
        processingTimeline: [
          { step: "received", at: event.receivedAt || event.createdAt || null },
          { step: "normalized", at: event.capturedAt || null },
          { step: "decision", at: event.processedAt || null, status: event.decisionStatus || null }
        ],
        links: {
          vehicleState,
          parkingSession,
          violation
        }
      });
    },

    reprocess: async (req: Request, res: Response): Promise<void> => {
      const event = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.events, req.authContext, String(req.params.eventId));
      if (!event) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
      assertLotAccess(req.authContext, String(event.lotId || null), "Lot scope denied");
      const result = await reprocessEvent(repo, String(req.params.eventId), req.context.requestId, req.authContext?.uid || null);
      sendSuccess(res, result);
    },

    eventAudit: async (req: Request, res: Response): Promise<void> => {
      const event = await loadScopedDocById<Record<string, unknown>>(repo, COLLECTIONS.events, req.authContext, String(req.params.eventId));
      if (!event) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
      assertLotAccess(req.authContext, String(event.lotId || null), "Lot scope denied");
      const rows = (await repo.listDocs(COLLECTIONS.auditLogs, {
        filters: [
          ["entityType", "==", "event"],
          ["entityId", "==", String(req.params.eventId)]
        ],
        orderBy: "createdAt",
        direction: "desc"
      })) as Array<Record<string, unknown>>;
      const timelineRows = rows.map((row: Record<string, unknown>) => ({
        ...row,
        stepLabel:
          row.actionType === "event_ingested"
            ? "Processed"
            : row.actionType === "duplicate_event_suppressed"
              ? "Duplicate suppressed"
              : row.actionType === "event_ingest_failed"
                ? "Processing failed"
                : row.actionType
      })) as Array<Record<string, unknown>>;

      sendSuccess(
        res,
        [
          ...timelineRows,
          {
            id: `${event.id}_received`,
            actionType: "event_received",
            stepLabel: "Received",
            createdAt: event.receivedAt || event.createdAt || null,
            summary: "Event received by ingestion layer"
          } as Record<string, unknown>
        ]
      );
    }
  };
}
