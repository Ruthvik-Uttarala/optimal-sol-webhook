import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";

export function buildVehiclesRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/vehiclesController").createVehiclesController>) {
  const router = Router();
  router.get("/vehicles", controller.listVehicles);
  router.get("/vehicles/:normalizedPlate", controller.getVehicle);
  router.get("/vehicles/:normalizedPlate/events", controller.vehicleEvents);
  router.get("/vehicles/:normalizedPlate/violations", controller.vehicleViolations);
  router.get("/vehicles/:normalizedPlate/sessions", controller.vehicleSessions);
  return router;
}
