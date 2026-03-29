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

export function RulesPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("All");
  const rules = useApiQuery<Array<Record<string, unknown>>>(["rules"], "/rules", { refetchInterval: 5000 });
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
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>Priority-ordered business rules with activation controls and audit visibility.</p>
        </div>
      </div>
      <FilterBar>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Rule name" />
        <Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="Status filter" />
        <Button
          onClick={async () => {
            await api.post("/rules", {
              lotId: "lot_demo_001",
              name: name || "New Rule",
              description: "Created from UI",
              type: "grace_period",
              status: "active",
              priority: 50,
              conditions: { minutes: 10 },
              actions: { allow: true }
            });
            await queryClient.invalidateQueries({ queryKey: ["rules"] });
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
              <Button onClick={async () => { await api.post(`/rules/${row.id}/activate`); await queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("Rule activated"); }}>Activate</Button>
              <Button onClick={async () => { await api.post(`/rules/${row.id}/deactivate`); await queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("Rule deactivated"); }}>Deactivate</Button>
            </div>
          ])}
        />
      </Card>
    </div>
  );
}
