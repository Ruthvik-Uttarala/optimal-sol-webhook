import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useRoleNavigation } from "../hooks/useRoleNavigation";
import { useSessionStore } from "../store/useSessionStore";
import { Input } from "../components/Input";
import { StatusChip } from "../components/Badge";
import { firebaseAuth } from "../lib/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";

function resolveSearchRoute(query: string, role: string | null | undefined): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (/^(evt_|pm_evt_)/i.test(trimmed)) return `/events/${trimmed}`;
  if (/^vio_/i.test(trimmed)) return `/violations/${trimmed}`;
  if (/^[A-Z0-9-]{3,10}$/i.test(trimmed)) return `/vehicles/${trimmed.toUpperCase()}`;
  if (role && ["admin", "super_admin"].includes(role) && (trimmed.includes("@") || trimmed.includes(" "))) {
    return `/users?search=${encodeURIComponent(trimmed)}`;
  }
  return null;
}

export function AppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const {
    user,
    access,
    unreadCount,
    signOut,
    currentLotId,
    currentOrganizationId,
    authMode,
    setCurrentContext
  } = useSessionStore();
  const navItems = useRoleNavigation(user?.role);
  const envLabel = import.meta.env.VITE_ENV_LABEL || "Test";

  const envTone = useMemo(() => (envLabel.toLowerCase().includes("prod") ? "production" : "test"), [envLabel]);
  const lotOptions = useMemo(
    () =>
      access
        .filter((item) => item.lotId && item.organizationId)
        .map((item) => ({
          key: `${item.organizationId}:${item.lotId}`,
          label: `${item.lotId} (${item.roleWithinLot || user?.role || "user"})`,
          lotId: item.lotId || null,
          organizationId: item.organizationId || null
        })),
    [access, user?.role]
  );
  const currentContextKey = `${currentOrganizationId || "na"}:${currentLotId || "na"}`;

  return (
    <div className="layout-shell">
      <aside className="sidebar">
        <div style={{ display: "grid", gap: 8, marginBottom: 22 }}>
          <div>
            <h2 style={{ margin: 0 }}>ParkingSol</h2>
            <p className="sidebar-label" style={{ color: "var(--text-tertiary)", margin: "4px 0 0" }}>
              Operations Intelligence
            </p>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Active workspace
            </div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{currentLotId || "No lot selected"}</div>
            <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>{currentOrganizationId || "No organization scope"}</div>
          </div>
        </div>
        <nav style={{ display: "grid", gap: 4 }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div>
        <header className="topbar">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const target = resolveSearchRoute(search, user?.role);
              if (target) navigate(target);
            }}
            style={{ display: "flex", gap: 8, alignItems: "center", width: "min(560px, 75%)" }}
          >
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search plate / event ID / violation ID / user"
              aria-label="Global search"
              style={{ width: "100%" }}
            />
            <button className="primary-button" type="submit">
              Search
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {lotOptions.length > 1 ? (
              <label className="input" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <strong>Lot</strong>
                <select
                  value={currentContextKey}
                  onChange={(event) => {
                    const next = lotOptions.find((item) => item.key === event.target.value);
                    if (!next) return;
                    setCurrentContext(next.lotId, next.organizationId);
                    void queryClient.invalidateQueries();
                  }}
                  style={{ border: 0, background: "transparent", color: "inherit" }}
                >
                  {lotOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="input" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <strong>Lot</strong>
                <span>{currentLotId || "all lots"}</span>
              </span>
            )}
            <Link to="/notifications" className="input" aria-label="Notifications">
              Alerts ({unreadCount})
            </Link>
            <StatusChip text={envLabel} tone={envTone as "test" | "production"} />
            <span className="input" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <strong>Org</strong>
              <span>{currentOrganizationId || "n/a"}</span>
            </span>
            <details className="input" style={{ position: "relative" }}>
              <summary style={{ listStyle: "none", cursor: "pointer" }}>
                {user?.displayName || "Guest"}
              </summary>
              <div
                className="card"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 10px)",
                  minWidth: 220,
                  display: "grid",
                  gap: 10,
                  zIndex: 5
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{user?.displayName || "Guest"}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{user?.email || ""}</div>
                </div>
                <Link to="/profile" className="input">
                  Profile
                </Link>
                <button
                  className="input"
                  onClick={async () => {
                    signOut();
                    queryClient.clear();
                    navigate("/login", { replace: true });
                    if ((authMode === "firebase" || firebaseAuth?.currentUser) && firebaseAuth) {
                      await firebaseSignOut(firebaseAuth);
                    }
                  }}
                >
                  Sign out
                </button>
              </div>
            </details>
          </div>
        </header>
        <main className="main-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
