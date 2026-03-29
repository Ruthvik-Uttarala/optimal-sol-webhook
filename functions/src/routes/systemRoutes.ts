import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildSystemRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/systemController").createSystemController>) {
  const router = Router();
  router.get("/health", controller.health);
  router.get("/system/status", controller.status);
  router.get("/system/config", controller.config);
  router.get("/system/metrics", controller.metrics);
  return router;
}
