import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildMeRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/meController").createMeController>) {
  const router = Router();
  router.get("/me", controller.me);
  router.get("/me/access", controller.access);
  return router;
}
