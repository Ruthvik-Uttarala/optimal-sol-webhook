import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildViolationsRoutes(
  controller: ReturnTypeWithoutNew<typeof import("../controllers/violationsController").createViolationsController>
) {
  const router = Router();
  router.get("/violations", controller.listViolations);
  router.get("/violations/:violationId", controller.getViolation);
  router.get("/violations/:violationId/audit", controller.audit);
  return router;
}
