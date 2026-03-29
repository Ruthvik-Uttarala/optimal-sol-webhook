import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";
import { requireRole } from "../middleware/auth";

export function buildOrganizationsRoutes(
  controller: ReturnTypeWithoutNew<typeof import("../controllers/organizationsController").createOrganizationsController>
) {
  const router = Router();
  router.use(requireRole(["admin", "super_admin"]));
  router.get("/organizations", controller.listOrganizations);
  router.get("/organizations/:organizationId", controller.getOrganization);
  router.get("/lots", controller.listLots);
  router.get("/lots/:lotId", controller.getLot);
  return router;
}
