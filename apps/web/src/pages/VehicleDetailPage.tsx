import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/Card";
import { useApiQuery } from "../hooks/useApiQuery";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { PageState } from "./common";
import { Table } from "../components/Table";

function formatConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}

export function VehicleDetailPage() {
  const { plate } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [flags, setFlags] = useState("");
  const [notes, setNotes] = useState("");
  const vehicle = useApiQuery<Record<string, unknown>>(["vehicle", plate], `/vehicles/${plate}`);
  const events = useApiQuery<Array<Record<string, unknown>>>(["vehicle-events", plate], `/vehicles/${plate}/events`);
  const violations = useApiQuery<Array<Record<string, unknown>>>(["vehicle-violations", plate], `/vehicles/${plate}/violations`);
  const sessions = useApiQuery<Array<Record<string, unknown>>>(["vehicle-sessions", plate], `/vehicles/${plate}/sessions`);
  const latestLprEvent = (vehicle.data?.latestLprEvent as Record<string, unknown> | undefined) || null;

  const summaryFlags = useMemo(() => {
    const rawFlags = Array.isArray(vehicle.data?.flags) ? vehicle.data.flags : [];
    return rawFlags.length ? rawFlags.join(", ") : "";
  }, [vehicle.data]);

  useEffect(() => {
    setFlags(summaryFlags);
  }, [summaryFlags]);

  async function saveFlags() {
    await api.patch(`/vehicles/${plate}/flags`, {
      flags: flags ? flags.split(",").map((item) => item.trim()).filter(Boolean) : [],
      notesSummary: notes || null
    });
    await queryClient.invalidateQueries();
    toast.success("Vehicle flags updated");
  }

  return (
    <PageState loading={vehicle.isLoading} error={vehicle.error ? "Failed to load vehicle" : null}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>Vehicle Detail</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>{String(vehicle.data?.normalizedPlate || plate || "-")}</p>
          </div>
          <Badge label={String(vehicle.data?.currentStatus || "-")} tone={vehicle.data?.currentStatus === "paid" ? "paid" : vehicle.data?.currentStatus === "unpaid" ? "unpaid" : "pending"} />
        </div>

        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <Card title="Current State">
            <div style={{ display: "grid", gap: 8 }}>
              <div>Presence: {String(vehicle.data?.presenceStatus || "-")}</div>
              <div>Payment: {String(vehicle.data?.currentPaymentId || "-")}</div>
              <div>Permit: {String(vehicle.data?.currentPermitId || "-")}</div>
              <div>Open violation: {vehicle.data?.openViolationId ? String(vehicle.data.openViolationId) : "-"}</div>
              <div>Last seen: {String(vehicle.data?.lastSeenAt || "-")}</div>
              <div>Last source type: {String(vehicle.data?.lastSourceType || "-")}</div>
              <div>Flags: {summaryFlags || "-"}</div>
            </div>
          </Card>

          <Card title="Latest LPR Signal">
            <div style={{ display: "grid", gap: 8 }}>
              <div>Camera: {String(latestLprEvent?.cameraLabel || latestLprEvent?.cameraName || "-")}</div>
              <div>Source type: {String(latestLprEvent?.sourceType || "-")}</div>
              <div>OCR confidence: {formatConfidence(latestLprEvent?.plateConfidence)}</div>
              <div>Detector confidence: {formatConfidence(latestLprEvent?.detectorConfidence)}</div>
              <div>Consensus frames: {String(latestLprEvent?.frameConsensusCount ?? "-")}</div>
              <div>Manual review: {String(Boolean(latestLprEvent?.manualReviewRequired))}</div>
              <div>Demo session: {String(latestLprEvent?.demoSessionId || "-")}</div>
            </div>
          </Card>

          <Card title="Update Flags">
            <div style={{ display: "grid", gap: 10 }}>
              <Input value={flags} onChange={(event) => setFlags(event.target.value)} placeholder="Comma-separated flags" />
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes summary" />
              <Button onClick={saveFlags}>Save flags</Button>
            </div>
          </Card>
        </div>

        <Card title="Recent Events">
          <Table
            headers={["Event", "Captured", "Source", "Decision", "Confidence", "Violation"]}
            rows={(events.data || []).map((row) => [
              String(row.id || "-"),
              String(row.capturedAt || "-"),
              <div style={{ display: "grid", gap: 4 }}>
                <span>{String(row.cameraLabel || row.cameraName || row.sourceType || "-")}</span>
                <span style={{ color: "var(--text-secondary)" }}>{String(row.sourceType || "-")}</span>
              </div>,
              <Badge
                label={String(row.decisionStatus || "-")}
                tone={row.decisionStatus === "paid" ? "paid" : row.decisionStatus === "unpaid" ? "unpaid" : "pending"}
              />,
              <div style={{ display: "grid", gap: 4 }}>
                <span>OCR {formatConfidence(row.plateConfidence)}</span>
                <span style={{ color: "var(--text-secondary)" }}>Detector {formatConfidence(row.detectorConfidence)}</span>
              </div>,
              String(row.violationId || "-")
            ])}
          />
        </Card>
        <Card title="Recent Violations">
          <Table
            headers={["Violation", "Status", "Severity", "Created"]}
            rows={(violations.data || []).map((row) => [
              String(row.id || "-"),
              String(row.status || "-"),
              String(row.severity || "-"),
              String(row.createdAt || "-")
            ])}
          />
        </Card>
        <Card title="Sessions">
          <Table
            headers={["Session", "Status", "Opened", "Closed"]}
            rows={(sessions.data || []).map((row) => [
              String(row.id || "-"),
              String(row.status || "-"),
              String(row.openedAt || "-"),
              String(row.closedAt || "-")
            ])}
          />
        </Card>
        <Card title="Evidence and Notes">
          <div style={{ display: "grid", gap: 8 }}>
            <div>Notes summary: {String(vehicle.data?.notesSummary || "-")}</div>
            <div>Flags: {summaryFlags || "-"}</div>
            <div>Duplicate count: {String(vehicle.data?.duplicateCountRecent || 0)}</div>
            <div>Latest evidence refs: {Array.isArray(latestLprEvent?.evidenceRefs) ? latestLprEvent.evidenceRefs.length : 0}</div>
          </div>
        </Card>
      </div>
    </PageState>
  );
}
