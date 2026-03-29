import { Link, Navigate } from "react-router-dom";
import { useAmbientPointer } from "../hooks/useAmbientPointer";
import { getAuthenticatedDestination, isPublicSignupEnabled } from "../lib/authSession";
import { useSessionStore } from "../store/useSessionStore";

export function HomePage() {
  const user = useSessionStore((state) => state.user);
  const isBootstrapped = useSessionStore((state) => state.isBootstrapped);
  const { prefersReducedMotion, style, onPointerMove } = useAmbientPointer();

  if (!isBootstrapped) {
    return <div className="card">Loading session...</div>;
  }

  const destination = getAuthenticatedDestination(user);
  if (destination) {
    return <Navigate to={destination} replace />;
  }

  const allowSignup = isPublicSignupEnabled();

  return (
    <div className="auth-experience auth-experience--landing" onPointerMove={onPointerMove} style={style}>
      <div className="auth-ambient" aria-hidden="true">
        <div className="auth-orb auth-orb--ginger" />
        <div className="auth-orb auth-orb--cocoa" />
        <div className="auth-grid-glow" />
      </div>
      <header className="public-topbar">
        <div>
          <div className="landing-brand">ParkingSol</div>
          <div className="landing-subbrand">Premium parking operations intelligence</div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {allowSignup ? (
            <Link className="ghost-link" to="/login?mode=signup">
              Sign up
            </Link>
          ) : null}
          <Link className="primary-button" to="/login">
            Login
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Parking operations intelligence</p>
          <h1>See every plate event turn into an operational decision the moment it lands.</h1>
          <p className="landing-description">
            ParkingSol sits after capture, normalizes the event, checks payment and permit truth, opens violations only when needed,
            and keeps operators aligned with live status, notifications, and audit visibility.
          </p>
          <div className="landing-actions">
            <Link className="primary-button" to="/login">
              Enter operations
            </Link>
            {allowSignup ? (
              <Link className="ghost-link" to="/login?mode=signup">
                Create a pending-access account
              </Link>
            ) : null}
          </div>
          <ul className="landing-points">
            <li>Webhook-first ingestion with paid, unpaid, exempt, duplicate, and exit flow visibility.</li>
            <li>Realtime operator notifications backed by Firestore, not local demo state.</li>
            <li>Warm premium control-room UX with disciplined glass surfaces and strong semantic states.</li>
          </ul>
        </div>

        <div className="landing-showcase">
          <div className="landing-panel">
            <div className="landing-panel-label">Live decision flow</div>
            <div className="landing-sequence">
              <span>Webhook</span>
              <span>Normalize</span>
              <span>Rules</span>
              <span>Violations</span>
              <span>Operators</span>
            </div>
            <div className="landing-metric-grid">
              <div>
                <strong>Paid / Exempt</strong>
                <span>Clears quietly when truth exists.</span>
              </div>
              <div>
                <strong>Unpaid</strong>
                <span>Creates a violation and notifies assigned staff.</span>
              </div>
              <div>
                <strong>Duplicate</strong>
                <span>Suppresses noise while preserving event history.</span>
              </div>
              <div>
                <strong>Exit</strong>
                <span>Closes sessions and keeps current vehicle state honest.</span>
              </div>
            </div>
          </div>
          <div className="landing-proof">
            <p>Designed for operator clarity first</p>
            <h2>Readable queues, grounded decision states, and enough atmosphere to feel premium without losing focus.</h2>
            <span>{prefersReducedMotion ? "Reduced motion is active." : "Ambient motion follows the cursor lightly on this page only."}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
