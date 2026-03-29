import { defineSecret } from "firebase-functions/params";
import { TEST_RETENTION_DAYS_DEFAULT } from "./constants";

export const POSTMAN_CLIENT_SECRET_PARAM = defineSecret("POSTMAN_CLIENT_SECRET");
export const INTERNAL_TEST_KEY_PARAM = defineSecret("INTERNAL_TEST_KEY");

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export const env = {
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "parking-sol-local",
  envLabel: process.env.ENV_LABEL || "Test",
  defaultOrganizationId: process.env.DEFAULT_ORGANIZATION_ID || "org_demo_001",
  defaultLotId: process.env.DEFAULT_LOT_ID || "lot_demo_001",
  defaultDuplicateWindowSeconds: readNumber(process.env.DEFAULT_DUPLICATE_WINDOW_SECONDS, 120),
  defaultGracePeriodMinutes: readNumber(process.env.DEFAULT_GRACE_PERIOD_MINUTES, 10),
  allowTestHeaders: (process.env.ALLOW_TEST_HEADERS || "true").toLowerCase() === "true",
  testRetentionDays: readNumber(process.env.TEST_DATA_RETENTION_DAYS, TEST_RETENTION_DAYS_DEFAULT),
  isProductionLike:
    (process.env.ENV_LABEL || "").toLowerCase() === "production" ||
    process.env.GCLOUD_PROJECT?.toLowerCase().includes("prod") === true
};

export function getPostmanClientSecret(): string {
  const fromEnv = process.env.POSTMAN_CLIENT_SECRET;
  if (fromEnv) return fromEnv;
  try {
    return POSTMAN_CLIENT_SECRET_PARAM.value();
  } catch {
    return "";
  }
}

export function getInternalTestKey(): string {
  const fromEnv = process.env.INTERNAL_TEST_KEY;
  if (fromEnv) return fromEnv;
  try {
    return INTERNAL_TEST_KEY_PARAM.value();
  } catch {
    return "";
  }
}
