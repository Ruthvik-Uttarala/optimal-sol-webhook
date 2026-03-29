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

export function UserDetailPage() {
  const { userId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState("");
  const [accessLotId, setAccessLotId] = useState("");
  const [accessOrgId, setAccessOrgId] = useState("");
  const user = useApiQuery<Record<string, unknown>>(["user", userId], `/users/${userId}`);
  const access = useApiQuery<Array<Record<string, unknown>>>(["user-access", userId], `/users/${userId}/access`);

  async function saveRole() {
    await api.patch(`/users/${userId}`, { globalRole: role || user.data?.globalRole });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["user", userId] }),
      queryClient.invalidateQueries({ queryKey: ["users"] })
    ]);
    toast.success("User updated");
  }

  return (
    <PageState loading={user.isLoading} error={user.error ? "Failed to load user" : null}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>User Detail</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>{String(user.data?.email || userId || "-")}</p>
          </div>
          <Badge label={String(user.data?.globalRole || "-")} tone={user.data?.globalRole === "admin" || user.data?.globalRole === "super_admin" ? "paid" : "info"} />
        </div>
        <Card title="Profile">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(user.data || {}, null, 2)}</pre>
        </Card>
        <Card title="Edit Role / Status">
          <div style={{ display: "grid", gap: 10 }}>
            <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder={String(user.data?.globalRole || "Role")} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button onClick={saveRole}>Save role</Button>
              <Button onClick={async () => { await api.post(`/users/${userId}/deactivate`); await queryClient.invalidateQueries({ queryKey: ["user", userId] }); toast.success("User deactivated"); }}>Deactivate</Button>
              <Button onClick={async () => { await api.post(`/users/${userId}/reactivate`); await queryClient.invalidateQueries({ queryKey: ["user", userId] }); toast.success("User reactivated"); }}>Reactivate</Button>
            </div>
          </div>
        </Card>
        <Card title="Access">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(access.data || [], null, 2)}</pre>
        </Card>
        <Card title="Grant Access">
          <div style={{ display: "grid", gap: 10 }}>
            <Input value={accessOrgId} onChange={(event) => setAccessOrgId(event.target.value)} placeholder="Organization ID" />
            <Input value={accessLotId} onChange={(event) => setAccessLotId(event.target.value)} placeholder="Lot ID" />
            <Button
              onClick={async () => {
                await api.post(`/users/${userId}/access`, {
                  organizationId: accessOrgId,
                  lotId: accessLotId,
                  roleWithinLot: user.data?.globalRole || "operator"
                });
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["user-access", userId] }),
                  queryClient.invalidateQueries({ queryKey: ["user", userId] }),
                  queryClient.invalidateQueries({ queryKey: ["users"] })
                ]);
                toast.success("Access granted");
              }}
            >
              Grant access
            </Button>
          </div>
        </Card>
      </div>
    </PageState>
  );
}
