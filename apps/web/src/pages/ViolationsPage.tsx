import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { FilterBar } from "../components/FilterBar";
import { Input } from "../components/Input";
import { Table } from "../components/Table";
import { useApiQuery } from "../hooks/useApiQuery";
import { Badge } from "../components/Badge";
import { Tabs } from "../components/Tabs";
import { useSessionStore } from "../store/useSessionStore";

export function ViolationsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const currentLotId = useSessionStore((state) => state.currentLotId);
  const violations = useApiQuery<Array<Record<string, unknown>>>(["violations", currentLotId, query, status], "/violations", {
    params: query ? { lotId: currentLotId, plate: query } : { lotId: currentLotId, limit: 100 },
    refetchInterval: 5000
  });

  const rows = useMemo(
    () =>
      (violations.data || []).filter((row) => {
        if (status !== "All" && String(row.status || "") !== status.toLowerCase()) return false;
        if (!query.trim()) return true;
        const haystack = `${row.id} ${row.normalizedPlate || ""}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      }),
    [violations.data, query, status]
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Violations</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
            Active enforcement queue for {currentLotId || "all accessible lots"} with assignment, severity, and aging signals.
          </p>
        </div>
      </div>
      <FilterBar>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by plate or violation ID" />
        <Tabs tabs={["All", "open", "acknowledged", "escalated", "resolved", "dismissed"]} active={status} onChange={setStatus} />
      </FilterBar>
      <Card>
        <Table
          headers={["Violation", "Plate", "Status", "Severity", "Assigned", "Aging"]}
          rows={rows.map((row) => [
            <Link to={`/violations/${row.id}`}>{String(row.id)}</Link>,
            <Link to={`/vehicles/${row.normalizedPlate}`}>{String(row.normalizedPlate || "-")}</Link>,
            <Badge label={String(row.status || "-")} tone={row.status === "open" ? "unpaid" : row.status === "resolved" ? "paid" : "pending"} />,
            String(row.severity || "-"),
            String(row.assignedToUserId || "-"),
            String(row.createdAt || "-")
          ])}
        />
      </Card>
    </div>
  );
}
