import { Link } from "react-router-dom";
import { useApiQuery } from "../hooks/useApiQuery";
import { Card } from "../components/Card";
import { PageState } from "./common";
import { Table } from "../components/Table";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

function summaryValue(value: unknown) {
  return typeof value === "number" ? value : 0;
}

export function DashboardPage() {
  const metrics = useApiQuery<Record<string, number>>(["metrics"], "/system/metrics", { refetchInterval: 8000 });
  const events = useApiQuery<Array<Record<string, unknown>>>(["events-preview"], "/events", { params: { limit: 5 }, refetchInterval: 5000 });
  const violations = useApiQuery<Array<Record<string, unknown>>>(["violations-preview"], "/violations", { params: { limit: 5 }, refetchInterval: 5000 });
  const notifications = useApiQuery<Array<Record<string, unknown>>>(["notifications-preview"], "/notifications", { params: { limit: 5 }, refetchInterval: 5000 });
  const status = useApiQuery<Record<string, unknown>>(["system-status-preview"], "/system/status", { refetchInterval: 10000 });
  const vehicles = useApiQuery<Array<Record<string, unknown>>>(["vehicles-preview"], "/vehicles", { params: { limit: 25 }, refetchInterval: 10000 });

  const unpaidVehicles = (vehicles.data || []).filter((row) => row.currentStatus === "unpaid" || row.openViolationId);
  const openViolations = (violations.data || []).filter((row) => row.status === "open" || row.status === "acknowledged" || row.status === "escalated");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>Operational snapshot with the latest events, violations, and system state.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/events" className="input">Live events</Link>
          <Link to="/violations" className="input">Violations</Link>
          <Link to="/notifications" className="input">Notifications</Link>
          <Link to="/system-status" className="input">System status</Link>
        </div>
      </div>

      <PageState loading={metrics.isLoading} error={metrics.error ? "Failed to load metrics" : null}>
        <div className="grid-cards">
          <Card title="Events Today"><strong>{summaryValue(metrics.data?.eventsToday)}</strong></Card>
          <Card title="Open Violations"><strong>{summaryValue(metrics.data?.activeOpenViolations)}</strong></Card>
          <Card title="Vehicles In Lot"><strong>{summaryValue(metrics.data?.vehiclesCurrentlyInLot)}</strong></Card>
          <Card title="Unread Alerts"><strong>{summaryValue(metrics.data?.unreadAlerts)}</strong></Card>
          <Card title="Processing Success"><strong>{summaryValue(metrics.data?.processingSuccess)}</strong></Card>
          <Card title="Processing Failures"><strong>{summaryValue(metrics.data?.processingFailureCount)}</strong></Card>
        </div>
      </PageState>

      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        <Card title="Recent Live Events" action={<Link to="/events">View all</Link>}>
          <Table
            headers={["Event", "Plate", "Decision"]}
            rows={(events.data || []).map((row) => [
              <Link to={`/events/${row.id}`}>{String(row.id)}</Link>,
              String(row.normalizedPlate || "-"),
              <Badge label={String(row.decisionStatus || "-")} tone={(row.decisionStatus as "paid" | "pending" | "unpaid") || "info"} />
            ])}
          />
        </Card>

        <Card title="Open Violations" action={<Link to="/violations">View all</Link>}>
          <Table
            headers={["Violation", "Plate", "Status"]}
            rows={openViolations.map((row) => [
              <Link to={`/violations/${row.id}`}>{String(row.id)}</Link>,
              String(row.normalizedPlate || "-"),
              String(row.status || "-")
            ])}
          />
        </Card>

        <Card title="Unpaid Vehicles Needing Attention" action={<Link to="/vehicles">View all</Link>}>
          <Table
            headers={["Plate", "Status", "Presence"]}
            rows={unpaidVehicles.map((row) => [
              <Link to={`/vehicles/${row.normalizedPlate}`}>{String(row.normalizedPlate || "-")}</Link>,
              String(row.currentStatus || "-"),
              String(row.presenceStatus || "-")
            ])}
          />
        </Card>

        <Card title="Notifications" action={<Link to="/notifications">Open</Link>}>
          <Table
            headers={["Title", "Severity"]}
            rows={(notifications.data || []).map((row) => [String(row.title || "-"), String(row.severity || "info")])}
          />
        </Card>

        <Card title="System Health" action={<Link to="/system-status">Details</Link>}>
          <div style={{ display: "grid", gap: 8 }}>
            <Badge label={String(status.data?.healthy ? "Healthy" : "Attention required")} tone={status.data?.healthy ? "paid" : "unpaid"} />
            <div>Last event: {String(status.data?.lastEventReceived || "-")}</div>
            <div>Last success: {String(status.data?.lastSuccessfulProcessingTime || "-")}</div>
            <div>Last failure: {String(status.data?.lastFailedProcessingTime || "-")}</div>
            <div>Source mode: {String(status.data?.eventSourceMode || "Test/Postman")}</div>
          </div>
        </Card>

        <Card title="Quick Actions">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => window.location.assign("/events")}>Review events</Button>
            <Button onClick={() => window.location.assign("/violations")}>Review violations</Button>
            <Button onClick={() => window.location.assign("/vehicles")}>Review vehicles</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
