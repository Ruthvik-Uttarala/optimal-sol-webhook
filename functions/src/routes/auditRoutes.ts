import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildAuditRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/auditController").createAuditController>) {
  const router = Router();
  router.get("/audit", controller.list);
  router.get("/audit/:auditId", controller.get);
  return router;
}
