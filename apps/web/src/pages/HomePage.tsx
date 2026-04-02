import { Navigate } from "react-router-dom";
import { getAuthenticatedDestination } from "../lib/authSession";
import { useSessionStore } from "../store/useSessionStore";

export function HomePage() {
  const user = useSessionStore((state) => state.user);
  const bootstrapStatus = useSessionStore((state) => state.bootstrapStatus);
  const bootstrapMessage = useSessionStore((state) => state.bootstrapMessage);
  const clearSession = useSessionStore((state) => state.clearSession);

  if (bootstrapStatus === "loading") {
    return <div className="card">Loading session...</div>;
  }

  if (bootstrapStatus === "error") {
    return (
      <div className="card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <div>
          <h2 style={{ margin: 0 }}>Session Error</h2>
          <p style={{ margin: "8px 0 0", color: "var(--text-secondary)" }}>
            {bootstrapMessage || "We could not finish loading this authenticated session."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
          <button className="ghost-link ghost-link--button" type="button" onClick={() => clearSession()}>
            Clear session
          </button>
        </div>
      </div>
    );
  }

  return <Navigate to={getAuthenticatedDestination(user, bootstrapStatus) || "/login"} replace />;
}
