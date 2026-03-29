import { Router } from "express";
import type { ReturnTypeWithoutNew } from "./types";
import { requireRole } from "../middleware/auth";

export function buildUsersRoutes(controller: ReturnTypeWithoutNew<typeof import("../controllers/usersController").createUsersController>) {
  const router = Router();
  router.use(requireRole(["admin", "super_admin"]));
  router.get("/users", controller.listUsers);
  router.get("/users/:userId", controller.getUser);
  router.get("/users/:userId/access", controller.userAccess);
  return router;
}
