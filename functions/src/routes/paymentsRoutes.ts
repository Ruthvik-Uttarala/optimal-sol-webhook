import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";
import { requireRole } from "../middleware/auth";

export function buildPaymentsRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/paymentsController").createPaymentsController>) {
  const router = Router();
  router.use(requireRole(["admin", "support"]));
  router.get("/payments", controller.list);
  router.get("/payments/:paymentId", controller.get);
  return router;
}
