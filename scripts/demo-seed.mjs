import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const defaultConfigPath = fs.existsSync(path.join(repoRoot, "demo", "demo-plates.local.json"))
  ? path.join(repoRoot, "demo", "demo-plates.local.json")
  : path.join(repoRoot, "demo", "demo-plates.example.json");

const configPath = process.argv[2] ? path.resolve(repoRoot, process.argv[2]) : defaultConfigPath;
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const apiBaseUrl = String(process.env.PARKINGSOL_API_BASE_URL || "").trim();
const bearerToken = String(process.env.PARKINGSOL_BEARER_TOKEN || "").trim();
const internalTestKey = String(process.env.PARKINGSOL_INTERNAL_TEST_KEY || "").trim();

if (!apiBaseUrl) {
  throw new Error("PARKINGSOL_API_BASE_URL is required");
}
if (!bearerToken) {
  throw new Error("PARKINGSOL_BEARER_TOKEN is required");
}
if (!internalTestKey) {
  throw new Error("PARKINGSOL_INTERNAL_TEST_KEY is required");
}

function normalizeApiBaseUrl(value) {
  return value.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
}

function apiHeaders(extra = {}) {
  return {
    authorization: `Bearer ${bearerToken}`,
    "content-type": "application/json",
    "x-internal-test-key": internalTestKey,
    ...extra
  };
}

async function apiRequest(method, route, body, headers = {}) {
  const response = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}${route}`, {
    method,
    headers: apiHeaders(headers),
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function ensureSource() {
  const sources = await apiRequest("GET", `/api/v1/sources?lotId=${encodeURIComponent(config.lotId)}`);
  const existing = Array.isArray(sources)
    ? sources.find((source) => source.sourceKey === config.source.sourceKey)
    : null;
  if (existing) {
    return existing;
  }

  const created = await apiRequest("POST", "/api/v1/sources", {
    organizationId: config.organizationId,
    lotId: config.lotId,
    name: config.source.name,
    sourceKey: config.source.sourceKey,
    type: "webcam_lpr",
    status: "active",
    directionMode: "unknown",
    cameraLabel: config.source.cameraLabel,
    cameraName: config.source.cameraName,
    cameraId: config.source.cameraId,
    demoMode: true,
    metadata: {
      demoSessionId: config.demoSessionId
    }
  });
  return { id: created.id, sourceKey: config.source.sourceKey };
}

async function cleanupDemo(sourceId) {
  return apiRequest("POST", "/api/v1/test/demo-cleanup", {
    lotId: config.lotId,
    demoSessionId: config.demoSessionId,
    sourceId,
    sourceKey: config.source.sourceKey,
    plates: [
      config.paidPlate?.plate,
      config.permitPlate?.plate,
      config.unpaidPlate?.plate
    ].filter(Boolean)
  });
}

async function seedPayment() {
  if (!config.paidPlate?.plate) {
    return null;
  }
  return apiRequest("POST", "/api/v1/test/seed-payment", {
    organizationId: config.organizationId,
    lotId: config.lotId,
    plate: config.paidPlate.plate,
    validFrom: config.paidPlate.validFrom,
    validUntil: config.paidPlate.validUntil,
    paymentType: config.paidPlate.paymentType || "manual_override"
  });
}

async function seedPermit() {
  if (!config.permitPlate?.plate) {
    return null;
  }
  return apiRequest("POST", "/api/v1/test/seed-permit", {
    organizationId: config.organizationId,
    lotId: config.lotId,
    plate: config.permitPlate.plate,
    validFrom: config.permitPlate.validFrom,
    validUntil: config.permitPlate.validUntil,
    permitType: config.permitPlate.permitType || "allowlist"
  });
}

async function main() {
  const source = await ensureSource();
  const cleanup = await cleanupDemo(source.id);
  const payment = await seedPayment();
  const permit = await seedPermit();

  console.log(
    JSON.stringify(
      {
        configPath,
        source,
        cleanup,
        payment,
        permit,
        unpaidPlate: config.unpaidPlate?.plate || null
      },
      null,
      2
    )
  );
}

void main();
