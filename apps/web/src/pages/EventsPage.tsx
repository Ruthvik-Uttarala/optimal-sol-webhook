import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { FilterBar } from "../components/FilterBar";
import { Input } from "../components/Input";
import { Table } from "../components/Table";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { useApiQuery } from "../hooks/useApiQuery";
import { useToast } from "../components/Toast";
import { useSessionStore } from "../store/useSessionStore";

export function EventsPage() {
  const [query, setQuery] = useState("");
  const currentLotId = useSessionStore((state) => state.currentLotId);
  const toast = useToast();
  const events = useApiQuery<Array<Record<string, unknown>>>(["events", currentLotId, query], "/events", {
    params: query ? { lotId: currentLotId, plate: query } : { lotId: currentLotId, limit: 100 },
    refetchInterval: 5000
  });

  const rows = useMemo(
    () =>
      (events.data || []).filter((row) => {
        if (!query.trim()) return true;
        const haystack = `${row.id} ${row.normalizedPlate || ""} ${row.sourceId || ""}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      }),
    [events.data, query]
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Live Events</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
            Newest first for {currentLotId || "all accessible lots"}, with decision status and linked operational context.
          </p>
        </div>
      </div>
      <FilterBar>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by plate or event ID" />
        <Button onClick={() => setQuery("")}>Clear</Button>
      </FilterBar>
      <Card>
        <Table
          headers={["Timestamp", "Plate", "Source", "Direction", "Confidence", "Processing", "Decision", "Violation", "Actions"]}
          rows={rows.map((row) => [
            String(row.capturedAt || "-"),
            <Link to={`/vehicles/${row.normalizedPlate}`}>{String(row.normalizedPlate || "-")}</Link>,
            <span>{String(row.cameraLabel || row.sourceId || "-")}</span>,
            String(row.sourceDirection || "-"),
            String(row.plateConfidence ?? "-"),
            String(row.processingStatus || "-"),
            <Badge
              label={String(row.decisionStatus || "-")}
              tone={row.decisionStatus === "paid" ? "paid" : row.decisionStatus === "unpaid" ? "unpaid" : "pending"}
            />,
            row.violationId ? <Link to={`/violations/${row.violationId}`}>Open</Link> : "-",
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="input" to={`/events/${row.id}`}>View</Link>
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(String(row.id));
                  toast.success("Event ID copied");
                }}
              >
                Copy ID
              </Button>
            </div>
          ])}
        />
      </Card>
    </div>
  );
}
