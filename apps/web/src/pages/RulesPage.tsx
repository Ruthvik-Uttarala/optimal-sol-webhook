import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { FilterBar } from "../components/FilterBar";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { useApiQuery } from "../hooks/useApiQuery";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "../store/useSessionStore";

export function RulesPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("All");
  const currentLotId = useSessionStore((state) => state.currentLotId);
  const currentOrganizationId = useSessionStore((state) => state.currentOrganizationId);
  const rules = useApiQuery<Array<Record<string, unknown>>>(["rules", currentLotId], "/rules", {
    params: currentLotId ? { lotId: currentLotId } : undefined,
    refetchInterval: 5000
  });
  const toast = useToast();
  const queryClient = useQueryClient();

  const filtered = useMemo(
    () =>
      (rules.data || []).filter((row) => {
        if (status !== "All" && String(row.status || "") !== status.toLowerCase()) return false;
        if (!name.trim()) return true;
        return String(row.name || "").toLowerCase().includes(name.trim().toLowerCase());
      }),
    [rules.data, name, status]
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Rules</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
            Priority-ordered rules for {currentLotId || "the selected lot"} with activation controls and audit visibility.
          </p>
        </div>
      </div>
      <FilterBar>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Rule name" />
        <Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="Status filter" />
        <Button
          onClick={async () => {
            if (!currentLotId) {
              toast.error("Select a lot before creating a rule.");
              return;
            }
            await api.post("/rules", {
              organizationId: currentOrganizationId || undefined,
              lotId: currentLotId,
              name: name || "New Rule",
              description: "Created from UI",
              type: "violation_threshold",
              status: "active",
              priority: 50,
              conditions: { trigger: "default_unpaid" },
              actions: { createViolation: true }
            });
            await queryClient.invalidateQueries({ queryKey: ["rules", currentLotId] });
            toast.success("Rule created");
          }}
        >
          Create Rule
        </Button>
      </FilterBar>
      <Card>
        <Table
          headers={["Rule", "Type", "Status", "Priority", "Actions"]}
          rows={filtered.map((row) => [
            <Link to={`/rules/${row.id}`}>{String(row.name || row.id)}</Link>,
            String(row.type || "-"),
            <Badge label={String(row.status || "-")} tone={row.status === "active" ? "paid" : "pending"} />,
            String(row.priority || "-"),
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button onClick={async () => { await api.post(`/rules/${row.id}/activate`); await queryClient.invalidateQueries({ queryKey: ["rules", currentLotId] }); toast.success("Rule activated"); }}>Activate</Button>
              <Button onClick={async () => { await api.post(`/rules/${row.id}/deactivate`); await queryClient.invalidateQueries({ queryKey: ["rules", currentLotId] }); toast.success("Rule deactivated"); }}>Deactivate</Button>
            </div>
          ])}
        />
      </Card>
    </div>
  );
}
