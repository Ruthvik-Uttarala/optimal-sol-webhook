import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useApiQuery } from "../hooks/useApiQuery";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { PageState } from "./common";

export function ViolationDetailPage() {
  const { violationId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [dismissReason, setDismissReason] = useState("");
  const [assignee, setAssignee] = useState("");
  const violation = useApiQuery<Record<string, unknown>>(["violation", violationId], `/violations/${violationId}`);
  const audit = useApiQuery<Array<Record<string, unknown>>>(["violation-audit", violationId], `/violations/${violationId}/audit`);

  async function action(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.post(path, body);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["violation", violationId] }),
        queryClient.invalidateQueries({ queryKey: ["violation-audit", violationId] }),
        queryClient.invalidateQueries({ queryKey: ["violations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
      toast.success("Action applied");
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageState loading={violation.isLoading} error={violation.error ? "Failed to load violation" : null}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>Violation Detail</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>{String(violation.data?.reasonSummary || violationId || "-")}</p>
          </div>
          <Badge label={String(violation.data?.status || "-")} tone={violation.data?.status === "resolved" ? "paid" : violation.data?.status === "open" ? "unpaid" : "pending"} />
        </div>

        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <Card title="Summary">
            <div style={{ display: "grid", gap: 8 }}>
              <div>Plate: <strong>{String(violation.data?.normalizedPlate || "-")}</strong></div>
              <div>Severity: {String(violation.data?.severity || "-")}</div>
              <div>Reason: {String(violation.data?.reasonCode || "-")}</div>
              <div>Assigned: {String(violation.data?.assignedToUserId || "-")}</div>
              <div>Triggered by event: {violation.data?.triggerEventId ? <a href={`/events/${violation.data.triggerEventId}`}>{String(violation.data.triggerEventId)}</a> : "-"}</div>
            </div>
          </Card>

          <Card title="Vehicle History">
            <div style={{ display: "grid", gap: 8 }}>
              <div>Vehicle state: {String(violation.data?.vehicleStateId || "-")}</div>
              <div>Session: {String(violation.data?.parkingSessionId || "-")}</div>
              <div>Evidence count: {Array.isArray(violation.data?.evidenceRefs) ? violation.data.evidenceRefs.length : 0}</div>
            </div>
          </Card>
        </div>

        <Card title="Action Panel">
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button disabled={busy} onClick={() => action(`/violations/${violationId}/acknowledge`)}>Acknowledge</Button>
              <Button disabled={busy} onClick={() => action(`/violations/${violationId}/resolve`, { reason: "resolved", notes: resolveNotes || "Resolved from UI" })}>Resolve</Button>
              <Button disabled={busy} onClick={() => action(`/violations/${violationId}/dismiss`, { reason: dismissReason || "false positive" })}>Dismiss</Button>
              <Button disabled={busy} onClick={() => action(`/violations/${violationId}/escalate`)}>Escalate</Button>
              <Button disabled={busy} onClick={() => action(`/violations/${violationId}/assign`, { assignedToUserId: assignee || "uid_operator_001" })}>Assign</Button>
            </div>
            <Input value={resolveNotes} onChange={(event) => setResolveNotes(event.target.value)} placeholder="Resolve notes" />
            <Input value={dismissReason} onChange={(event) => setDismissReason(event.target.value)} placeholder="Dismiss reason" />
            <Input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Assign to user ID" />
          </div>
        </Card>

        <Card title="Notes and Audit">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify({
            resolutionNotes: violation.data?.resolutionNotes || null,
            dismissalReason: violation.data?.dismissalReason || null
          }, null, 2)}</pre>
          <div style={{ marginTop: 16 }}>
            {audit.data?.length ? audit.data.map((entry) => (
              <div key={String(entry.id)} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-default)" }}>
                <strong>{String(entry.actionType || entry.summary || "Action")}</strong>
                <div style={{ color: "var(--text-secondary)" }}>{String(entry.createdAt || "-")}</div>
              </div>
            )) : <div>No audit trail yet.</div>}
          </div>
        </Card>
      </div>
    </PageState>
  );
}
