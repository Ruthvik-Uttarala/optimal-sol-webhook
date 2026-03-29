import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildEventsRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/eventsController").createEventsController>) {
  const router = Router();

  router.post("/webhooks/postman/events", controller.ingestPostman);
  router.post("/webhooks/unifi/events", controller.ingestUnifi);
  router.post("/events/manual", controller.manualEvent);

  router.get("/events", controller.listEvents);
  router.get("/events/:eventId", controller.getEvent);
  router.post("/events/:eventId/reprocess", controller.reprocess);
  router.get("/events/:eventId/audit", controller.eventAudit);

  return router;
}
