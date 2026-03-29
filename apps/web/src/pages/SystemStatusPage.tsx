import { Card } from "../components/Card";
import { useApiQuery } from "../hooks/useApiQuery";
import { Badge } from "../components/Badge";
import { PageState } from "./common";

export function SystemStatusPage() {
  const status = useApiQuery<Record<string, unknown>>(["system-status"], "/system/status", { refetchInterval: 10000 });
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
          </div>
        </Card>
        <Card title="Configuration">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(config.data || {}, null, 2)}</pre>
        </Card>
      </div>
    </PageState>
  );
}
