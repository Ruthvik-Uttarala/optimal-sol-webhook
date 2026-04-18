import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { logger } from "firebase-functions";
import { buildApp } from "./app";
import { createRepository } from "./repositories/firestoreRepository";
import { cleanupTestArtifacts } from "./services/cleanupService";
import { env, INTERNAL_TEST_KEY_PARAM, LPR_CLIENT_SECRET_PARAM, POSTMAN_CLIENT_SECRET_PARAM } from "./config/env";

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10
});

const app = buildApp();

export const api = onRequest(
  {
    secrets: [POSTMAN_CLIENT_SECRET_PARAM, LPR_CLIENT_SECRET_PARAM, INTERNAL_TEST_KEY_PARAM]
  },
  app
);

// Compatibility export to preserve existing webhook integration shape.
export const unifiWebhook = onRequest(
  {
    secrets: [POSTMAN_CLIENT_SECRET_PARAM]
  },
  async (req, res) => {
    req.url = "/api/v1/webhooks/unifi/events";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (app as any)(req, res);
  }
);

export const cleanupTestArtifactsJob = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "America/New_York",
    secrets: [INTERNAL_TEST_KEY_PARAM]
  },
  async () => {
    if (env.isProductionLike) {
      logger.info("Skipping test artifact cleanup in production-like environment");
      return;
    }

    const repo = createRepository("firestore");
    const result = await cleanupTestArtifacts(repo, env.testRetentionDays);
    logger.info("Test artifacts cleanup complete", result);
  }
);
