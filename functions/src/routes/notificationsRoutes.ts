import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildNotificationsRoutes(
  controller: ReturnTypeWithoutNew<typeof import("../controllers/notificationsController").createNotificationsController>
) {
  const router = Router();
  router.get("/notifications", controller.list);
  router.post("/notifications/:notificationId/read", controller.readOne);
  router.post("/notifications/read-all", controller.readAll);
  return router;
}
