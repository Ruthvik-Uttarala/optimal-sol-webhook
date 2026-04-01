import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/Card";
import { useApiQuery } from "../hooks/useApiQuery";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useToast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { PageState } from "./common";

function renderPairs(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return <div className="input">{String(value ?? "-")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {Object.entries(value).map(([key, itemValue]) => (
        <div key={key} className="input" style={{ display: "grid", gap: 4 }}>
          <strong>{key}</strong>
          <span>{typeof itemValue === "object" ? JSON.stringify(itemValue) : String(itemValue ?? "-")}</span>
        </div>
      ))}
    </div>
  );
}

export function RuleDetailPage() {
  const { ruleId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("");
  const rule = useApiQuery<Record<string, unknown>>(["rule", ruleId], `/rules/${ruleId}`);
  const audit = useApiQuery<Array<Record<string, unknown>>>(["rule-audit", ruleId], `/rules/${ruleId}/audit`);

  async function save() {
    await api.patch(`/rules/${ruleId}`, {
      name: name || rule.data?.name,
      priority: priority ? Number(priority) : rule.data?.priority
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["rule", ruleId] }),
      queryClient.invalidateQueries({ queryKey: ["rules"] }),
      queryClient.invalidateQueries({ queryKey: ["rule-audit", ruleId] })
    ]);
    toast.success("Rule updated");
  }

  return (
    <PageState loading={rule.isLoading} error={rule.error ? "Failed to load rule" : null}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>Rule Detail</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>{String(rule.data?.description || ruleId || "-")}</p>
          </div>
          <Badge label={String(rule.data?.status || "-")} tone={rule.data?.status === "active" ? "paid" : "pending"} />
        </div>
        <Card title="Rule Summary">
          <div style={{ display: "grid", gap: 8 }}>
            <div>Name: {String(rule.data?.name || "-")}</div>
            <div>Type: {String(rule.data?.type || "-")}</div>
            <div>Priority: {String(rule.data?.priority || "-")}</div>
            <div>Lot: {String(rule.data?.lotId || "-")}</div>
            <div>Conditions</div>
            {renderPairs(rule.data?.conditions)}
            <div>Actions</div>
            {renderPairs(rule.data?.actions)}
          </div>
        </Card>
        <Card title="Edit Rule">
          <div style={{ display: "grid", gap: 10 }}>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={String(rule.data?.name || "Rule name")} />
            <Input value={priority} onChange={(event) => setPriority(event.target.value)} placeholder={String(rule.data?.priority || "Priority")} />
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={save}>Save</Button>
              <Button onClick={async () => { await api.post(`/rules/${ruleId}/activate`); await Promise.all([queryClient.invalidateQueries({ queryKey: ["rule", ruleId] }), queryClient.invalidateQueries({ queryKey: ["rules"] })]); toast.success("Rule activated"); }}>Activate</Button>
              <Button onClick={async () => { await api.post(`/rules/${ruleId}/deactivate`); await Promise.all([queryClient.invalidateQueries({ queryKey: ["rule", ruleId] }), queryClient.invalidateQueries({ queryKey: ["rules"] })]); toast.success("Rule deactivated"); }}>Deactivate</Button>
            </div>
          </div>
        </Card>
        <Card title="Audit">
          {audit.data?.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {audit.data.map((entry, index) => (
                <div key={String(entry.id || index)} className="input" style={{ display: "grid", gap: 4 }}>
                  <strong>{String(entry.actionType || entry.summary || "Audit event")}</strong>
                  <span>{String(entry.createdAt || "-")}</span>
                  <span>{String(entry.summary || entry.entityType || "-")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>No audit events recorded yet.</div>
          )}
        </Card>
      </div>
    </PageState>
  );
}
