import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { FilterBar } from "../components/FilterBar";
import { Input } from "../components/Input";
import { Table } from "../components/Table";
import { useApiQuery } from "../hooks/useApiQuery";
import { Badge } from "../components/Badge";

export function VehiclesPage() {
  const [query, setQuery] = useState("");
  const vehicles = useApiQuery<Array<Record<string, unknown>>>(["vehicles", query], "/vehicles", {
    params: query ? { plate: query } : { limit: 100 },
    refetchInterval: 5000
  });

  const rows = useMemo(
    () =>
      (vehicles.data || []).filter((row) => {
        if (!query.trim()) return true;
        const haystack = `${row.normalizedPlate || ""} ${row.currentStatus || ""}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      }),
    [vehicles.data, query]
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Vehicles</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>Current vehicle state, payment/permit context, and linked events.</p>
        </div>
      </div>
      <FilterBar>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by plate" />
      </FilterBar>
      <Card>
        <Table
          headers={["Plate", "Current Status", "Presence", "Payment", "Permit", "Open Violation"]}
          rows={rows.map((row) => [
            <Link to={`/vehicles/${row.normalizedPlate}`}>{String(row.normalizedPlate || "-")}</Link>,
            <Badge label={String(row.currentStatus || "-")} tone={row.currentStatus === "paid" ? "paid" : row.currentStatus === "unpaid" ? "unpaid" : "pending"} />,
            String(row.presenceStatus || "-"),
            String(row.currentPaymentId || "-"),
            String(row.currentPermitId || "-"),
            row.openViolationId ? <Link to={`/violations/${row.openViolationId}`}>View</Link> : "-"
          ])}
        />
      </Card>
    </div>
  );
}
