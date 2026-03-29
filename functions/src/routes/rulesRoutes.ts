import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";
import { requireRole } from "../middleware/auth";

export function buildRulesRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/rulesController").createRulesController>) {
  const router = Router();
  router.use(requireRole(["admin", "super_admin"]));
  router.get("/rules", controller.list);
  router.get("/rules/:ruleId", controller.get);
  router.get("/rules/:ruleId/audit", controller.audit);
  return router;
}
