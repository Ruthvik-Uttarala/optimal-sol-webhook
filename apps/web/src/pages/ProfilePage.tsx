import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/Card";
import { useSessionStore } from "../store/useSessionStore";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

export function ProfilePage() {
  const user = useSessionStore((state) => state.user);
  const access = useSessionStore((state) => state.access);
  const currentLotId = useSessionStore((state) => state.currentLotId);
  const updateUserPreferences = useSessionStore((state) => state.updateUserPreferences);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [soundEnabled, setSoundEnabled] = useState(Boolean(user?.notificationPreferences?.soundEnabled));
  const [digestEnabled, setDigestEnabled] = useState(Boolean(user?.notificationPreferences?.digestEnabled));

  async function savePreferences() {
    const nextPreferences = {
      soundEnabled,
      digestEnabled
    };
    await api.patch("/me/preferences", nextPreferences);
    updateUserPreferences(nextPreferences);
    await queryClient.invalidateQueries();
    toast.success("Preferences updated");
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Profile</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>Current user bootstrap, access scope, and notification preferences.</p>
        </div>
        <Badge label={String(user?.role || "-")} tone={user?.role === "admin" || user?.role === "super_admin" ? "paid" : "info"} />
      </div>
      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Card title="Session">
          <div style={{ display: "grid", gap: 8 }}>
            <div>Name: {String(user?.displayName || "-")}</div>
            <div>Email: {String(user?.email || "-")}</div>
            <div>Default lot: {String(user?.defaultLotId || currentLotId || "-")}</div>
            <div>Default org: {String(user?.defaultOrganizationId || "-")}</div>
          </div>
        </Card>
        <Card title="Notification Preferences">
          <div style={{ display: "grid", gap: 10 }}>
            <label className="input" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Sound enabled</span>
              <input checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} type="checkbox" />
            </label>
            <label className="input" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Digest enabled</span>
              <input checked={digestEnabled} onChange={(event) => setDigestEnabled(event.target.checked)} type="checkbox" />
            </label>
            <Button onClick={savePreferences}>Save preferences</Button>
          </div>
        </Card>
      </div>
      <Card title="Access Scope">
        {access.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {access.map((item) => (
              <div key={item.id} className="input" style={{ display: "grid", gap: 4 }}>
                <strong>{item.lotId || "No lot"}</strong>
                <span>{item.organizationId || "No organization"}</span>
                <span>{item.roleWithinLot || item.status || "-"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div>No access rows available.</div>
        )}
      </Card>
    </div>
  );
}
