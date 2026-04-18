import cors from "cors";
import express from "express";

import { createRepository, type IDataRepository } from "./repositories/firestoreRepository";
import { requestContext } from "./middleware/requestContext";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { createAuthMiddleware, requireInternalTestKey, requireLotScope, requireRole } from "./middleware/auth";
import { validateBody } from "./middleware/validate";
import {
  assignViolationSchema,
  createAccessSchema,
  createLotSchema,
  createPaymentSchema,
  createPermitSchema,
  createRuleSchema,
  createSourceSchema,
  createUserSchema,
  dismissViolationSchema,
  ingestPayloadSchema,
  lprIngestPayloadSchema,
  patchVehicleFlagsSchema,
  patchSystemConfigSchema,
  resolveViolationSchema,
  updatePreferencesSchema
} from "./schemas/contracts";
import { createSystemController } from "./controllers/systemController";
import { createMeController } from "./controllers/meController";
import { createEventsController } from "./controllers/eventsController";
import { createVehiclesController } from "./controllers/vehiclesController";
import { createViolationsController } from "./controllers/violationsController";
import { createPaymentsController } from "./controllers/paymentsController";
import { createPermitsController } from "./controllers/permitsController";
import { createRulesController } from "./controllers/rulesController";
import { createNotificationsController } from "./controllers/notificationsController";
import { createUsersController } from "./controllers/usersController";
import { createOrganizationsController } from "./controllers/organizationsController";
import { createSourcesController } from "./controllers/sourcesController";
import { createAuditController } from "./controllers/auditController";
import { createTestController } from "./controllers/testController";
import { buildSystemRoutes } from "./routes/systemRoutes";
import { buildMeRoutes } from "./routes/meRoutes";
import { buildVehiclesRoutes } from "./routes/vehiclesRoutes";
import { buildViolationsRoutes } from "./routes/violationsRoutes";
import { buildPaymentsRoutes } from "./routes/paymentsRoutes";
import { buildPermitsRoutes } from "./routes/permitsRoutes";
import { buildRulesRoutes } from "./routes/rulesRoutes";
import { buildNotificationsRoutes } from "./routes/notificationsRoutes";
import { buildUsersRoutes } from "./routes/usersRoutes";
import { buildOrganizationsRoutes } from "./routes/organizationsRoutes";
import { buildSourcesRoutes } from "./routes/sourcesRoutes";
import { buildAuditRoutes } from "./routes/auditRoutes";
import { buildTestRoutes } from "./routes/testRoutes";

type ControllerMethod = (
  req: unknown,
  res: unknown,
  next: (error?: unknown) => void
) => unknown;

function wrapAsyncControllerMethod(method: ControllerMethod): ControllerMethod {
  return function wrappedMethod(req: unknown, res: unknown, next: (error?: unknown) => void) {
    Promise.resolve(method(req, res, next)).catch(next);
  };
}

function wrapController<T extends Record<string, unknown>>(controller: T): T {
  const wrapped = {} as T;
  for (const [key, value] of Object.entries(controller)) {
    if (typeof value === "function") {
      wrapped[key as keyof T] = wrapAsyncControllerMethod(value as ControllerMethod) as T[keyof T];
    } else {
      wrapped[key as keyof T] = value as T[keyof T];
    }
  }
  return wrapped;
}

export function buildApp(repo: IDataRepository = createRepository("firestore")) {
  const app = express();

  const auth = createAuthMiddleware(repo);
  const selfServiceAuth = createAuthMiddleware(repo, { allowMissingRole: true });

  const systemController = wrapController(createSystemController(repo));
  const meController = wrapController(createMeController(repo));
  const eventsController = wrapController(createEventsController(repo));
  const vehiclesController = wrapController(createVehiclesController(repo));
  const violationsController = wrapController(createViolationsController(repo));
  const paymentsController = wrapController(createPaymentsController(repo));
  const permitsController = wrapController(createPermitsController(repo));
  const rulesController = wrapController(createRulesController(repo));
  const notificationsController = wrapController(createNotificationsController(repo));
  const usersController = wrapController(createUsersController(repo));
  const organizationsController = wrapController(createOrganizationsController(repo));
  const sourcesController = wrapController(createSourcesController(repo));
  const auditController = wrapController(createAuditController(repo));
  const testController = wrapController(createTestController(repo));

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  app.get("/api/v1/health", systemController.health);

  const publicEventsRouter = express.Router();
  publicEventsRouter.post("/webhooks/postman/events", validateBody(ingestPayloadSchema), eventsController.ingestPostman);
  publicEventsRouter.post("/webhooks/unifi/events", eventsController.ingestUnifi);
  publicEventsRouter.post("/webhooks/lpr/events", validateBody(lprIngestPayloadSchema), eventsController.ingestLpr);
  app.use("/api/v1", publicEventsRouter);

  const selfServiceRouter = express.Router();
  selfServiceRouter.use(selfServiceAuth);
  const meRouter = buildMeRoutes(meController);
  meRouter.patch("/me/preferences", validateBody(updatePreferencesSchema), meController.patchPreferences);
  selfServiceRouter.use(meRouter);
  app.use("/api/v1", selfServiceRouter);

  const securedRouter = express.Router();
  securedRouter.use(auth);
  securedRouter.use(requireLotScope());
  const systemRouter = buildSystemRoutes(systemController);
  systemRouter.patch("/system/config", requireRole(["admin", "super_admin"]), validateBody(patchSystemConfigSchema), systemController.patchConfig);
  securedRouter.use(systemRouter);

  const manualEventsRouter = express.Router();
  manualEventsRouter.post("/events/manual", requireRole(["admin", "support"]), validateBody(ingestPayloadSchema), eventsController.manualEvent);
  manualEventsRouter.get("/events", eventsController.listEvents);
  manualEventsRouter.get("/events/:eventId", eventsController.getEvent);
  manualEventsRouter.post("/events/:eventId/reprocess", requireRole(["admin", "support"]), eventsController.reprocess);
  manualEventsRouter.get("/events/:eventId/audit", eventsController.eventAudit);
  securedRouter.use(manualEventsRouter);

  const vehiclesRouter = buildVehiclesRoutes(vehiclesController);
  vehiclesRouter.patch("/vehicles/:normalizedPlate/flags", requireRole(["admin", "operator", "manager"]), validateBody(patchVehicleFlagsSchema), vehiclesController.patchFlags);
  securedRouter.use(vehiclesRouter);

  const violationsRouter = buildViolationsRoutes(violationsController);
  violationsRouter.post("/violations/:violationId/acknowledge", requireRole(["admin", "operator", "manager", "super_admin"]), violationsController.acknowledge);
  violationsRouter.post("/violations/:violationId/resolve", requireRole(["admin", "operator", "manager", "super_admin"]), validateBody(resolveViolationSchema), violationsController.resolve);
  violationsRouter.post("/violations/:violationId/dismiss", requireRole(["admin", "operator", "manager", "super_admin"]), validateBody(dismissViolationSchema), violationsController.dismiss);
  violationsRouter.post("/violations/:violationId/escalate", requireRole(["admin", "operator", "manager", "super_admin"]), violationsController.escalate);
  violationsRouter.patch("/violations/:violationId/assign", requireRole(["admin", "manager"]), validateBody(assignViolationSchema), violationsController.assign);
  securedRouter.use(violationsRouter);

  const paymentsRouter = buildPaymentsRoutes(paymentsController);
  paymentsRouter.post("/payments", requireRole(["admin", "support"]), validateBody(createPaymentSchema), paymentsController.create);
  paymentsRouter.patch("/payments/:paymentId", requireRole(["admin", "support"]), paymentsController.patch);
  paymentsRouter.post("/payments/:paymentId/cancel", requireRole(["admin", "support"]), paymentsController.cancel);
  securedRouter.use(paymentsRouter);

  const permitsRouter = buildPermitsRoutes(permitsController);
  permitsRouter.post("/permits", requireRole(["admin", "support"]), validateBody(createPermitSchema), permitsController.create);
  permitsRouter.patch("/permits/:permitId", requireRole(["admin", "support"]), permitsController.patch);
  permitsRouter.post("/permits/:permitId/deactivate", requireRole(["admin", "support"]), permitsController.deactivate);
  securedRouter.use(permitsRouter);

  const rulesRouter = express.Router();
  rulesRouter.use(requireRole(["admin", "super_admin"]));
  rulesRouter.use(buildRulesRoutes(rulesController));
  rulesRouter.post("/rules", validateBody(createRuleSchema), rulesController.create);
  rulesRouter.patch("/rules/:ruleId", rulesController.patch);
  rulesRouter.post("/rules/:ruleId/activate", rulesController.activate);
  rulesRouter.post("/rules/:ruleId/deactivate", rulesController.deactivate);
  securedRouter.use(rulesRouter);

  securedRouter.use(buildNotificationsRoutes(notificationsController));

  const usersRouter = express.Router();
  usersRouter.use(requireRole(["admin", "super_admin"]));
  usersRouter.use(buildUsersRoutes(usersController));
  usersRouter.post("/users", validateBody(createUserSchema), usersController.createUser);
  usersRouter.post("/users/:userId/access", validateBody(createAccessSchema), usersController.createUserAccess);
  usersRouter.post("/users/:userId/deactivate", usersController.deactivateUser);
  usersRouter.post("/users/:userId/reactivate", usersController.reactivateUser);
  usersRouter.patch("/access/:accessId", usersController.patchAccess);
  usersRouter.post("/access/:accessId/revoke", usersController.revokeAccess);
  securedRouter.use(usersRouter);

  const orgRoutes = buildOrganizationsRoutes(organizationsController);
  orgRoutes.post("/lots", requireRole(["admin", "super_admin"]), validateBody(createLotSchema), organizationsController.createLot);
  orgRoutes.patch("/lots/:lotId", requireRole(["admin", "super_admin"]), organizationsController.patchLot);
  securedRouter.use(orgRoutes);

  const sourcesRoutes = buildSourcesRoutes(sourcesController);
  sourcesRoutes.post("/sources", requireRole(["admin", "super_admin"]), validateBody(createSourceSchema), sourcesController.create);
  sourcesRoutes.patch("/sources/:sourceId", requireRole(["admin", "super_admin"]), sourcesController.patch);
  sourcesRoutes.post("/sources/:sourceId/deactivate", requireRole(["admin", "super_admin"]), sourcesController.deactivate);
  securedRouter.use(sourcesRoutes);

  securedRouter.use(buildAuditRoutes(auditController));

  const testRoutes = buildTestRoutes(testController);
  testRoutes.use(requireRole(["admin", "support", "super_admin"]));
  testRoutes.use(requireInternalTestKey());
  securedRouter.use(testRoutes);

  app.use("/api/v1", securedRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
