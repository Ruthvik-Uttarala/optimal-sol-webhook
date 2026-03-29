import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
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
  const [search, setSearch] = useState("");
  const { user, unreadCount, signOut, currentLotId, currentOrganizationId, authMode } = useSessionStore();
  const navItems = useRoleNavigation(user?.role);
  const envLabel = import.meta.env.VITE_ENV_LABEL || "Test";

  const envTone = useMemo(() => (envLabel.toLowerCase().includes("prod") ? "production" : "test"), [envLabel]);

  return (
    <div className="layout-shell">
      <aside className="sidebar">
        <h2 style={{ marginTop: 0 }}>ParkingSol</h2>
        <p className="sidebar-label" style={{ color: "var(--text-tertiary)", marginTop: 0 }}>
          Operations Intelligence
        </p>
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
            <Link to="/notifications" className="input" aria-label="Notifications">
              Alerts ({unreadCount})
            </Link>
            <StatusChip text={envLabel} tone={envTone as "test" | "production"} />
            <span className="input" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <strong>Lot</strong>
              <span>{currentLotId || "all lots"}</span>
            </span>
            <span className="input" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <strong>Org</strong>
              <span>{currentOrganizationId || "n/a"}</span>
            </span>
            <span>{user?.displayName || "Guest"}</span>
            <button
              className="input"
              onClick={async () => {
                if ((authMode === "firebase" || firebaseAuth?.currentUser) && firebaseAuth) {
                  await firebaseSignOut(firebaseAuth);
                }
                signOut();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="main-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
