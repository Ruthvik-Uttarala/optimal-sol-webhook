import { Link, useNavigate } from "react-router-dom";
import { signOut as firebaseSignOut } from "firebase/auth";
import { Button } from "../components/Button";
import { useAmbientPointer } from "../hooks/useAmbientPointer";
import { firebaseAuth } from "../lib/firebase";
import { useSessionStore } from "../store/useSessionStore";

export function UnauthorizedPage() {
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const authMode = useSessionStore((state) => state.authMode);
  const clearSession = useSessionStore((state) => state.clearSession);
  const { style, onPointerMove } = useAmbientPointer();
  const pendingAccess = user?.status === "pending_access" || !user?.role;

  return (
    <div className="auth-experience" onPointerMove={onPointerMove} style={style}>
      <div className="auth-ambient" aria-hidden="true">
        <div className="auth-orb auth-orb--ginger" />
        <div className="auth-orb auth-orb--cocoa" />
        <div className="auth-grid-glow" />
      </div>
      <div className="auth-split auth-split--compact">
        <section className="auth-story">
          <p className="landing-kicker">{pendingAccess ? "Pending access" : "Unauthorized"}</p>
          <h1>{pendingAccess ? "Your identity is real, but operational access is still being granted." : "This account cannot open the requested workspace."}</h1>
          <p className="landing-description">
            {pendingAccess
              ? "Your Firebase session is active and your Firestore-backed profile has been created. An administrator still needs to assign role and lot access before you can enter the dashboard."
              : "The requested route is outside the current role or lot scope. Use an authorized account or return to the public entry experience."}
          </p>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-header">
            <div>
              <p className="landing-kicker">{pendingAccess ? "Account created" : "Access blocked"}</p>
              <h2>{pendingAccess ? "Awaiting approval" : "Permission denied"}</h2>
            </div>
            <Link className="ghost-link" to="/login">
              Login
            </Link>
          </div>

          <div className="auth-form">
            <p className={pendingAccess ? "auth-success" : "auth-error"}>
              {pendingAccess ? `Signed in as ${user?.email || "this account"}.` : "You do not currently have access to this page."}
            </p>
            <div className="auth-links">
              <Link to="/login">Go to login</Link>
              <button
                className="ghost-link ghost-link--button"
                type="button"
                onClick={async () => {
                  if (authMode === "firebase" && firebaseAuth) {
                    await firebaseSignOut(firebaseAuth);
                  }
                  clearSession();
                  navigate("/login", { replace: true });
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
