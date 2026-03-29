import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";
import { requireRole } from "../middleware/auth";

export function buildPermitsRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/permitsController").createPermitsController>) {
  const router = Router();
  router.use(requireRole(["admin", "support"]));
  router.get("/permits", controller.list);
  router.get("/permits/:permitId", controller.get);
  return router;
}
