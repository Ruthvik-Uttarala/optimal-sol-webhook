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
import { useSessionStore } from "../store/useSessionStore";

export function NotificationsPage() {
  const [tab, setTab] = useState("Unread");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const toast = useToast();
  const queryClient = useQueryClient();
  const authMode = useSessionStore((state) => state.authMode);
  const liveNotifications = useSessionStore((state) => state.notifications);
  const notifications = useApiQuery<Array<Record<string, unknown>>>(["notifications", tab], "/notifications", {
    refetchInterval: 5000,
    enabled: authMode !== "firebase"
  });
  const sourceRows = authMode === "firebase" ? liveNotifications : (notifications.data || []);

  const rows = useMemo(
    () =>
      sourceRows.filter((item) => {
        if (tab === "Unread" && item.isRead) return false;
        if (typeFilter && String(item.type || "") !== typeFilter) return false;
        if (severityFilter && String(item.severity || "") !== severityFilter) return false;
        return true;
      }),
    [severityFilter, sourceRows, tab, typeFilter]
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
              if (authMode !== "firebase") {
                await queryClient.invalidateQueries();
              }
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
                  <Link to={String(row.entityRoute || "/notifications")} className="input">
                    Open linked entity
                  </Link>
                </div>
              </div>
              <Button
                onClick={async () => {
                  await api.post(`/notifications/${row.id}/read`);
                  if (authMode !== "firebase") {
                    await queryClient.invalidateQueries();
                  }
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
