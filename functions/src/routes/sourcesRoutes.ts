import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";
import { requireRole } from "../middleware/auth";

export function buildSourcesRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/sourcesController").createSourcesController>) {
  const router = Router();
  router.use(requireRole(["admin", "super_admin"]));
  router.get("/sources", controller.list);
  router.get("/sources/:sourceId", controller.get);
  return router;
}
