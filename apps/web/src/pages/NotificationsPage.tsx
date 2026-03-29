import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/Card";
import { Tabs } from "../components/Tabs";
import { useApiQuery } from "../hooks/useApiQuery";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import { FilterBar } from "../components/FilterBar";
import { Input } from "../components/Input";

export function NotificationsPage() {
  const [tab, setTab] = useState("Unread");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const toast = useToast();
  const queryClient = useQueryClient();
  const notifications = useApiQuery<Array<Record<string, unknown>>>(["notifications", tab], "/notifications", {
    refetchInterval: 5000
  });

  const rows = useMemo(
    () =>
      (notifications.data || []).filter((item) => {
        if (tab === "Unread" && item.isRead) return false;
        if (typeFilter && String(item.type || "") !== typeFilter) return false;
        if (severityFilter && String(item.severity || "") !== severityFilter) return false;
        return true;
      }),
    [notifications.data, tab, typeFilter, severityFilter]
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Notifications</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>Unread and all views with source links and read actions.</p>
        </div>
      </div>
      <Tabs tabs={["Unread", "All"]} active={tab} onChange={setTab} />
      <FilterBar>
        <Input value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} placeholder="Filter by type" />
        <Input value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} placeholder="Filter by severity" />
      </FilterBar>
      <Card>
        <div style={{ display: "grid", gap: 12 }}>
          <Button
            onClick={async () => {
              await api.post("/notifications/read-all");
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["notifications"] }),
                queryClient.invalidateQueries({ queryKey: ["dashboard"] })
              ]);
              toast.success("Marked all as read");
            }}
          >
            Mark all as read
          </Button>
          {rows.length ? rows.map((row) => (
            <div key={String(row.id)} className="card" style={{ margin: 0 }}>
              <div className="page-head">
                <div>
                  <strong>{String(row.title || "Notification")}</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>{String(row.message || "")}</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span>{String(row.type || "-")}</span>
                  <span>{String(row.severity || "info")}</span>
                  <Link to={String(row.entityRoute || "#")} className="input">
                    Open linked entity
                  </Link>
                </div>
              </div>
              <Button
                onClick={async () => {
                  await api.post(`/notifications/${row.id}/read`);
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
                    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
                  ]);
                  toast.success("Marked as read");
                }}
              >
                Mark read
              </Button>
            </div>
          )) : <div>No notifications match the current filters.</div>}
        </div>
      </Card>
    </div>
  );
}
