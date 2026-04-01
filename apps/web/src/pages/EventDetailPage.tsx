import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { useApiQuery } from "../hooks/useApiQuery";
import { PageState } from "./common";
import { useSessionStore } from "../store/useSessionStore";

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
  const role = useSessionStore((state) => state.user?.role);
  const event = useApiQuery<Record<string, unknown>>(["event", params.eventId], `/events/${params.eventId}`);
  const audit = useApiQuery<Array<Record<string, unknown>>>(["event-audit", params.eventId], `/events/${params.eventId}/audit`);
  const canSeeDebug = role === "admin" || role === "support" || role === "super_admin";
  const debug = (event.data?.debug as Record<string, unknown> | undefined) || {};

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
              <div>Source: {String(event.data?.sourceName || event.data?.cameraLabel || event.data?.sourceId || "-")}</div>
              <div>Lot: {String(event.data?.lotId || "-")}</div>
              <div>Direction: {String(event.data?.sourceDirection || "-")}</div>
              <div>Type: {String(event.data?.eventType || "-")}</div>
              <div>Captured: {String(event.data?.capturedAt || "-")}</div>
              <div>Received: {String(event.data?.receivedAt || "-")}</div>
              <div>Decision reasons: {String(event.data?.decisionReasonCodes || []).replaceAll(",", ", ") || "-"}</div>
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
          <Card title="Processing Detail">
            <div style={{ display: "grid", gap: 8 }}>
              <div>External event: {String(event.data?.externalEventId || "-")}</div>
              <div>Confidence: {String(event.data?.plateConfidence ?? "-")}</div>
              <div>Active payment: {String(event.data?.activePaymentId || "-")}</div>
              <div>Active permit: {String(event.data?.activePermitId || "-")}</div>
              <div>Dedupe key: {String(event.data?.dedupeKey || "-")}</div>
            </div>
          </Card>
          <Card title="Payload Summary">
            <div style={{ display: "grid", gap: 8 }}>
              <div>Camera: {String(event.data?.cameraLabel || "-")}</div>
              <div>Request hash: {String(debug.rawPayloadHash || "-")}</div>
              <div>Error code: {String(debug.errorCode || "-")}</div>
              <div>Error message: {String(debug.errorMessage || "-")}</div>
            </div>
          </Card>
        </div>

        <Card title="Processing Timeline">
          {timeline.length ? timeline.map((item) => <TimelineRow key={item.label + item.value} label={item.label} value={item.value} />) : <div>No audit rows yet.</div>}
        </Card>

        {canSeeDebug ? (
          <Card title="Support Debug">
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(event.data?.rawPayload || {}, null, 2)}</pre>
          </Card>
        ) : null}
      </div>
    </PageState>
  );
}
