import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAmbientPointer } from "../hooks/useAmbientPointer";
import { buildPasswordResetUrl, describeAuthError } from "../lib/authSession";
import { firebaseAuth } from "../lib/firebase";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { style, onPointerMove } = useAmbientPointer();

  return (
    <div className="auth-experience" onPointerMove={onPointerMove} style={style}>
      <div className="auth-ambient" aria-hidden="true">
        <div className="auth-orb auth-orb--ginger" />
        <div className="auth-orb auth-orb--cocoa" />
        <div className="auth-grid-glow" />
      </div>
      <div className="auth-split auth-split--compact">
        <section className="auth-story">
          <p className="landing-kicker">Account recovery</p>
          <h1>Send a reset link that brings the user straight back into the app.</h1>
          <p className="landing-description">
            This flow uses Firebase Auth email actions with an in-app return path to `/reset-password`, so users never need the Firebase console.
          </p>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-header">
            <div>
              <p className="landing-kicker">Forgot password</p>
              <h2>Reset your password</h2>
            </div>
            <Link className="ghost-link" to="/login">
              Back to login
            </Link>
          </div>

          <div className="auth-form">
            <label className="auth-field">
              <span>Email</span>
              <Input
                aria-label="Email address"
                autoComplete="email"
                placeholder="you@company.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            {success ? <p className="auth-success">{success}</p> : null}
            <Button
              disabled={isSubmitting}
              onClick={async () => {
                setError(null);
                setSuccess(null);

                if (!email.trim()) {
                  setError("Enter the email address for the account.");
                  return;
                }

                if (!firebaseAuth) {
                  setError("Firebase authentication is not configured for this environment.");
                  return;
                }

                setIsSubmitting(true);
                try {
                  await sendPasswordResetEmail(firebaseAuth, email.trim(), {
                    url: buildPasswordResetUrl(),
                    handleCodeInApp: true
                  });
                  setSuccess("Reset email sent. Check your inbox for the secure link.");
                } catch (authError) {
                  setError(describeAuthError(authError, "Unable to send reset email."));
                } finally {
                  setIsSubmitting(false);
                }
              }}
              type="button"
            >
              {isSubmitting ? "Sending reset link..." : "Send reset email"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
