import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "../components/Card";
import { Table } from "../components/Table";
import { useApiQuery } from "../hooks/useApiQuery";
import { FilterBar } from "../components/FilterBar";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { useQueryClient } from "@tanstack/react-query";

export function UsersPage() {
  const [searchParams] = useSearchParams();
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const users = useApiQuery<Array<Record<string, unknown>>>(["users"], "/users");
  const toast = useToast();
  const queryClient = useQueryClient();
  const q = (searchParams.get("search") || "").toLowerCase();

  const filtered = useMemo(
    () =>
      (users.data || []).filter((row) => {
        if (roleFilter !== "All" && String(row.globalRole || "") !== roleFilter.toLowerCase()) return false;
        if (statusFilter !== "All" && String(row.status || "") !== statusFilter.toLowerCase()) return false;
        if (!q) return true;
        return `${row.displayName || ""} ${row.email || ""}`.toLowerCase().includes(q);
      }),
    [users.data, roleFilter, statusFilter, q]
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Users</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>Role and status management with access scoping.</p>
        </div>
      </div>
      <FilterBar>
        <Input value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} placeholder="Role filter" />
        <Input value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} placeholder="Status filter" />
        <Input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="New user name" />
        <Input value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} placeholder="New user email" />
        <Button
          onClick={async () => {
            await api.post("/users", {
              displayName: createName || "New User",
              email: createEmail || "user@example.com",
              globalRole: "operator"
            });
            await queryClient.invalidateQueries({ queryKey: ["users"] });
            toast.success("User created");
          }}
        >
          Create user
        </Button>
      </FilterBar>
      <Card>
        <Table
          headers={["User", "Email", "Role", "Status", "Access"]}
          rows={filtered.map((row) => [
            <Link to={`/users/${row.id}`}>{String(row.displayName || row.id)}</Link>,
            String(row.email || "-"),
            <Badge label={String(row.globalRole || "-")} tone={row.globalRole === "admin" || row.globalRole === "super_admin" ? "paid" : "info"} />,
            String(row.status || "-"),
            String(row.defaultLotId || "-")
          ])}
        />
      </Card>
    </div>
  );
}
