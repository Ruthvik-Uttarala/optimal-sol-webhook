import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/Card";
import { useApiQuery } from "../hooks/useApiQuery";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageState } from "./common";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

function renderObjectFields(title: string, value: unknown) {
  const rows = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
  return (
    <Card title={title}>
      {rows.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map(([key, entry]) => (
            <div key={key} className="input" style={{ display: "grid", gap: 4 }}>
              <strong>{key}</strong>
              <span>{typeof entry === "object" ? JSON.stringify(entry) : String(entry ?? "-")}</span>
            </div>
          ))}
        </div>
      ) : (
        <div>No defaults configured.</div>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const config = useApiQuery<Record<string, unknown>>(["system-config"], "/system/config");
  const toast = useToast();
  const queryClient = useQueryClient();
  const [environmentLabel, setEnvironmentLabel] = useState("");
  const [timezone, setTimezone] = useState("");
  const [retentionDays, setRetentionDays] = useState("");

  useEffect(() => {
    if (!config.data) return;
    setEnvironmentLabel(String(config.data.environmentLabel || ""));
    setTimezone(String(config.data.timezone || "America/New_York"));
    setRetentionDays(String(config.data.retentionDays || ""));
  }, [config.data]);

  async function saveConfig() {
    await api.patch("/system/config", {
      environmentLabel,
      timezone,
      retentionDays: retentionDays ? Number(retentionDays) : undefined
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["system-config"] }),
      queryClient.invalidateQueries({ queryKey: ["system-status"] })
    ]);
    toast.success("Settings saved");
  }

  return (
    <PageState loading={config.isLoading} error={config.error ? "Failed to load settings" : null}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>Settings</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
              Lot profile defaults, environment labeling, retention, and notification baseline settings.
            </p>
          </div>
          <Badge label="Admin only" tone="test" />
        </div>

        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <Card title="Environment">
            <div style={{ display: "grid", gap: 10 }}>
              <Input value={environmentLabel} onChange={(event) => setEnvironmentLabel(event.target.value)} placeholder="Environment label" />
              <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Timezone" />
              <Input value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} placeholder="Retention days" />
              <Button onClick={saveConfig}>Save settings</Button>
            </div>
          </Card>

        <Card title="Current Defaults">
          <div style={{ display: "grid", gap: 8 }}>
            <div>Environment label: {String(config.data?.environmentLabel || "-")}</div>
            <div>Canonical app origin: {String(import.meta.env.VITE_APP_BASE_URL || "-")}</div>
            <div>Timezone: {String(config.data?.timezone || "America/New_York")}</div>
            <div>Test mode enabled: {String(config.data?.testModeEnabled ?? "-")}</div>
            <div>Support mode enabled: {String(config.data?.supportModeEnabled ?? "-")}</div>
          </div>
        </Card>
        </div>

        {renderObjectFields("Notification Defaults", config.data?.notificationDefaults)}
        {renderObjectFields("Source Metadata Defaults", config.data?.sourceMetadataDefaults)}
      </div>
    </PageState>
  );
}
