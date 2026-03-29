import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAmbientPointer } from "../hooks/useAmbientPointer";
import { describeAuthError } from "../lib/authSession";
import { firebaseAuth } from "../lib/firebase";

type ResetStatus = "verifying" | "ready" | "success" | "invalid";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const { style, onPointerMove } = useAmbientPointer();
  const [status, setStatus] = useState<ResetStatus>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionCode = useMemo(() => searchParams.get("oobCode") || "", [searchParams]);

  useEffect(() => {
    let active = true;

    async function verifyCode() {
      if (!firebaseAuth || !actionCode) {
        if (active) {
          setStatus("invalid");
          setError("This reset link is missing required information. Request a new one.");
        }
        return;
      }

      try {
        const email = await verifyPasswordResetCode(firebaseAuth, actionCode);
        if (!active) return;
        setVerifiedEmail(email);
        setStatus("ready");
      } catch (authError) {
        if (!active) return;
        setStatus("invalid");
        setError(describeAuthError(authError, "This reset link is no longer valid."));
      }
    }

    void verifyCode();
    return () => {
      active = false;
    };
  }, [actionCode]);

  return (
    <div className="auth-experience" onPointerMove={onPointerMove} style={style}>
      <div className="auth-ambient" aria-hidden="true">
        <div className="auth-orb auth-orb--ginger" />
        <div className="auth-orb auth-orb--cocoa" />
        <div className="auth-grid-glow" />
      </div>
      <div className="auth-split auth-split--compact">
        <section className="auth-story">
          <p className="landing-kicker">Password reset</p>
          <h1>Finish recovery inside the app with a verified Firebase action code.</h1>
          <p className="landing-description">
            Valid links unlock the reset form. Invalid or expired links fall back cleanly to forgot password and login so the user is never stranded.
          </p>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-header">
            <div>
              <p className="landing-kicker">Reset password</p>
              <h2>
                {status === "verifying"
                  ? "Verifying link"
                  : status === "success"
                    ? "Password updated"
                    : status === "invalid"
                      ? "Link unavailable"
                      : "Create a new password"}
              </h2>
            </div>
            <Link className="ghost-link" to="/login">
              Back to login
            </Link>
          </div>

          {status === "verifying" ? (
            <div className="auth-form">
              <p className="auth-muted">Checking the reset link…</p>
            </div>
          ) : null}

          {status === "invalid" ? (
            <div className="auth-form">
              <p className="auth-error" role="alert">{error || "This reset link is invalid."}</p>
              <div className="auth-links">
                <Link to="/forgot-password">Request a new reset link</Link>
                <Link to="/login">Return to login</Link>
              </div>
            </div>
          ) : null}

          {status === "ready" ? (
            <div className="auth-form">
              <p className="auth-muted">Resetting password for {verifiedEmail || "this account"}.</p>
              <label className="auth-field">
                <span>New password</span>
                <Input
                  aria-label="New password"
                  autoComplete="new-password"
                  placeholder="Enter a new password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="auth-field">
                <span>Confirm password</span>
                <Input
                  aria-label="Confirm password"
                  autoComplete="new-password"
                  placeholder="Repeat the new password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              {error ? <p className="auth-error" role="alert">{error}</p> : null}
              <Button
                disabled={isSubmitting}
                onClick={async () => {
                  setError(null);
                  if (!firebaseAuth || !actionCode) {
                    setStatus("invalid");
                    setError("This reset link is missing required information. Request a new one.");
                    return;
                  }
                  if (!password || password.length < 6) {
                    setError("Use a stronger password with at least 6 characters.");
                    return;
                  }
                  if (password !== confirmPassword) {
                    setError("Passwords do not match.");
                    return;
                  }

                  setIsSubmitting(true);
                  try {
                    await confirmPasswordReset(firebaseAuth, actionCode, password);
                    setStatus("success");
                  } catch (authError) {
                    setError(describeAuthError(authError, "Unable to reset password."));
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                type="button"
              >
                {isSubmitting ? "Resetting password..." : "Reset password"}
              </Button>
            </div>
          ) : null}

          {status === "success" ? (
            <div className="auth-form">
              <p className="auth-success">Password reset complete. You can sign in with the new password now.</p>
              <Link className="primary-button" to="/login">
                Return to login
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
