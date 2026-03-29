import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { useApiQuery } from "../hooks/useApiQuery";
import { PageState } from "./common";

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-default)" }}>
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

export function EventDetailPage() {
  const params = useParams();
  const event = useApiQuery<Record<string, unknown>>(["event", params.eventId], `/events/${params.eventId}`);
  const audit = useApiQuery<Array<Record<string, unknown>>>(["event-audit", params.eventId], `/events/${params.eventId}/audit`);

  const timeline = useMemo(
    () =>
      (audit.data || []).map((entry) => ({
        label: String(entry.actionType || entry.summary || "Action"),
        value: `${String(entry.createdAt || "-")} ${entry.summary ? `- ${entry.summary}` : ""}`
      })),
    [audit.data]
  );

  return (
    <PageState loading={event.isLoading} error={event.error ? "Failed to load event" : null}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>Event Detail</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>{String(event.data?.id || params.eventId || "-")}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge label={String(event.data?.processingStatus || "received")} tone={(event.data?.decisionStatus as "paid" | "pending" | "unpaid") || "info"} />
            <Badge label={String(event.data?.decisionStatus || "pending_review")} tone={(event.data?.decisionStatus as "paid" | "pending" | "unpaid") || "pending"} />
          </div>
        </div>

        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <Card title="Event Summary">
            <div style={{ display: "grid", gap: 8 }}>
              <div>Plate: <strong>{String(event.data?.normalizedPlate || "-")}</strong></div>
              <div>Source: {String(event.data?.cameraLabel || event.data?.sourceId || "-")}</div>
              <div>Direction: {String(event.data?.sourceDirection || "-")}</div>
              <div>Captured: {String(event.data?.capturedAt || "-")}</div>
              <div>Received: {String(event.data?.receivedAt || "-")}</div>
              <div>Decision: {String(event.data?.decisionReasonCodes || []).replaceAll(",", ", ") || "-"}</div>
            </div>
          </Card>

          <Card title="Linked Entities">
            <div style={{ display: "grid", gap: 8 }}>
              <div>Vehicle: {event.data?.vehicleStateId ? <Link to={`/vehicles/${event.data.normalizedPlate}`}>Open vehicle</Link> : "-"}</div>
              <div>Violation: {event.data?.violationId ? <Link to={`/violations/${event.data.violationId}`}>Open violation</Link> : "-"}</div>
              <div>Session: {String(event.data?.parkingSessionId || "-")}</div>
              <div>Notifications: {Array.isArray(event.data?.notificationIds) ? event.data.notificationIds.length : 0}</div>
            </div>
          </Card>
        </div>

        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <Card title="Normalized Data">
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify({
              organizationId: event.data?.organizationId,
              lotId: event.data?.lotId,
              sourceId: event.data?.sourceId,
              externalEventId: event.data?.externalEventId,
              eventType: event.data?.eventType,
              sourceDirection: event.data?.sourceDirection,
              plate: event.data?.plate,
              normalizedPlate: event.data?.normalizedPlate,
              plateConfidence: event.data?.plateConfidence,
              dedupeKey: event.data?.dedupeKey
            }, null, 2)}</pre>
          </Card>

          <Card title="Raw Payload">
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(event.data?.rawPayload || {}, null, 2)}</pre>
          </Card>
        </div>

        <Card title="Processing Timeline">
          {timeline.length ? timeline.map((item) => <TimelineRow key={item.label + item.value} label={item.label} value={item.value} />) : <div>No audit rows yet.</div>}
        </Card>

        <Card title="Support Debug">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(event.data || {}, null, 2)}</pre>
        </Card>
      </div>
    </PageState>
  );
}
