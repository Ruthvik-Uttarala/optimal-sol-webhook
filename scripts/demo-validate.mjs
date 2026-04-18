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

if (!apiBaseUrl) {
  throw new Error("PARKINGSOL_API_BASE_URL is required");
}
if (!bearerToken) {
  throw new Error("PARKINGSOL_BEARER_TOKEN is required");
}

function normalizeApiBaseUrl(value) {
  return value.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
}

async function apiGet(route) {
  const response = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}${route}`, {
    headers: {
      authorization: `Bearer ${bearerToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GET ${route} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function main() {
  const [status, sources, events, vehiclePaid, vehicleUnpaid] = await Promise.all([
    apiGet(`/api/v1/system/status?lotId=${encodeURIComponent(config.lotId)}`),
    apiGet(`/api/v1/sources?lotId=${encodeURIComponent(config.lotId)}`),
    apiGet(`/api/v1/events?lotId=${encodeURIComponent(config.lotId)}&limit=10`),
    config.paidPlate?.plate ? apiGet(`/api/v1/vehicles/${encodeURIComponent(config.paidPlate.plate)}`).catch(() => null) : Promise.resolve(null),
    config.unpaidPlate?.plate ? apiGet(`/api/v1/vehicles/${encodeURIComponent(config.unpaidPlate.plate)}`).catch(() => null) : Promise.resolve(null)
  ]);

  console.log(
    JSON.stringify(
      {
        configPath,
        status,
        sourceFound: Array.isArray(sources) ? sources.some((source) => source.sourceKey === config.source.sourceKey) : false,
        recentEventIds: Array.isArray(events) ? events.map((event) => event.id).slice(0, 5) : [],
        paidVehicle: vehiclePaid ? { plate: vehiclePaid.normalizedPlate, currentStatus: vehiclePaid.currentStatus } : null,
        unpaidVehicle: vehicleUnpaid ? { plate: vehicleUnpaid.normalizedPlate, currentStatus: vehicleUnpaid.currentStatus } : null
      },
      null,
      2
    )
  );
}

void main();
