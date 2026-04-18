import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildTestRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/testController").createTestController>) {
  const router = Router();
  router.post("/test/seed-payment", controller.seedPayment);
  router.post("/test/seed-permit", controller.seedPermit);
  router.post("/test/reset-lot", controller.resetLot);
  router.post("/test/demo-cleanup", controller.cleanupDemoSession);
  return router;
}
