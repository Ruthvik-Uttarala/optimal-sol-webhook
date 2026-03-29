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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["vehicle", plate] }),
      queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    ]);
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
              <div>Flags: {summaryFlags || "-"}</div>
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
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(events.data || [], null, 2)}</pre>
        </Card>
        <Card title="Recent Violations">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(violations.data || [], null, 2)}</pre>
        </Card>
        <Card title="Sessions">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(sessions.data || [], null, 2)}</pre>
        </Card>
        <Card title="Evidence and Notes">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(vehicle.data?.notesSummary || {}, null, 2)}</pre>
        </Card>
      </div>
    </PageState>
  );
}
