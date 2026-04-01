import { Card } from "../components/Card";
import { useApiQuery } from "../hooks/useApiQuery";
import { Badge } from "../components/Badge";
import { PageState } from "./common";
import { useSessionStore } from "../store/useSessionStore";

function renderConfigCards(value: Record<string, unknown> | undefined) {
  const rows = Object.entries(value || {}).filter(([, entry]) => entry !== null && entry !== undefined && typeof entry !== "object");
  if (!rows.length) {
    return <div>No configuration values available.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map(([key, entry]) => (
        <div key={key} className="input" style={{ display: "grid", gap: 4 }}>
          <strong>{key}</strong>
          <span>{String(entry)}</span>
        </div>
      ))}
    </div>
  );
}

export function SystemStatusPage() {
  const currentLotId = useSessionStore((state) => state.currentLotId);
  const params = currentLotId ? { lotId: currentLotId } : undefined;
  const status = useApiQuery<Record<string, unknown>>(["system-status", currentLotId], "/system/status", {
    params,
    refetchInterval: 10000
  });
  const config = useApiQuery<Record<string, unknown>>(["system-config"], "/system/config");

  return (
    <PageState loading={status.isLoading} error={status.error ? "Failed to load system status" : null}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>System Status</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>Health, processing timestamps, connectivity, and deployment context.</p>
          </div>
        </div>
        <div className="grid-cards">
          <Card title="Health">
            <Badge label={String(status.data?.healthy ? "Healthy" : "Attention required")} tone={status.data?.healthy ? "paid" : "unpaid"} />
          </Card>
          <Card title="Last Event Received">{String(status.data?.lastEventReceived || "-")}</Card>
          <Card title="Last Success">{String(status.data?.lastSuccessfulProcessingTime || "-")}</Card>
          <Card title="Last Failure">{String(status.data?.lastFailedProcessingTime || "-")}</Card>
          <Card title="Firestore">{String(status.data?.firestoreState || "-")}</Card>
          <Card title="Notifications">{String(status.data?.notificationState || "-")}</Card>
        </div>
        <Card title="Deployment Context">
          <div style={{ display: "grid", gap: 8 }}>
            <div>Environment: {String(status.data?.deploymentEnvironment || config.data?.environmentLabel || "-")}</div>
            <div>Event source mode: {String(status.data?.eventSourceMode || "Test/Postman")}</div>
            <div>Scope mode: {String(status.data?.scopeMode || "global")}</div>
            <div>Scoped lots: {String(status.data?.scopedLotCount || 0)}</div>
            <div>Active sources: {String(status.data?.activeSourceCount || 0)}</div>
            <div>Unread alerts: {String(status.data?.unreadNotificationCount || 0)}</div>
          </div>
        </Card>
        <Card title="Configuration">
          {renderConfigCards(config.data)}
        </Card>
      </div>
    </PageState>
  );
}
