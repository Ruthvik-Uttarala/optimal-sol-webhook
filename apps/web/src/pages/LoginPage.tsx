import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAmbientPointer } from "../hooks/useAmbientPointer";
import { buildDevSession, describeAuthError, getAuthenticatedDestination, isDevFallbackEnabled, isPublicSignupEnabled } from "../lib/authSession";
import { firebaseAuth } from "../lib/firebase";
import { useSessionStore } from "../store/useSessionStore";

interface LoginValues {
  email: string;
  password: string;
  confirmPassword?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const allowSignup = isPublicSignupEnabled();
  const { style, onPointerMove } = useAmbientPointer();
  const user = useSessionStore((state) => state.user);
  const setSession = useSessionStore((state) => state.setSession);
  const setBootstrapped = useSessionStore((state) => state.setBootstrapped);
  const mode = useMemo(() => {
    const requested = searchParams.get("mode");
    if (requested === "signup" && allowSignup) return "signup";
    return "login";
  }, [allowSignup, searchParams]);
  const destination = getAuthenticatedDestination(user);

  const { register, handleSubmit, watch, formState } = useForm<LoginValues>({
    defaultValues: { email: "", password: "", confirmPassword: "" }
  });

  if (destination) return <Navigate to={destination} replace />;

  const password = watch("password");

  return (
    <div className="auth-experience" onPointerMove={onPointerMove} style={style}>
      <div className="auth-ambient" aria-hidden="true">
        <div className="auth-orb auth-orb--ginger" />
        <div className="auth-orb auth-orb--cocoa" />
        <div className="auth-grid-glow" />
      </div>
      <div className="auth-split">
        <section className="auth-story">
          <p className="landing-kicker">ParkingSol access</p>
          <h1>{mode === "signup" ? "Create your secure parking operations identity." : "Login"}</h1>
          <p className="landing-description">
            Sign in to the operator workspace backed by Firebase Authentication, Firestore access scope, and live operational state.
          </p>
          <div className="auth-feature-list">
            <div>
              <strong>Firestore-backed profile truth</strong>
              <span>Profile, access scope, and preferences come from backend state, not local placeholders.</span>
            </div>
            <div>
              <strong>Operator-safe access rules</strong>
              <span>Role and lot access stay enforced by Firebase Auth identity plus Firestore-backed authorization.</span>
            </div>
            <div>
              <strong>Reset flows inside the app</strong>
              <span>Forgot-password and reset-link recovery stay inside the deployed experience.</span>
            </div>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-header">
            <div>
              <p className="landing-kicker">{mode === "signup" ? "Pending access signup" : "Secure sign in"}</p>
              <h2>{mode === "signup" ? "Create account" : "Welcome back"}</h2>
            </div>
            <Link className="ghost-link" to="/forgot-password">
              Need help?
            </Link>
          </div>

          <form
            className="auth-form"
            onSubmit={handleSubmit(async (values) => {
              setError(null);
              setSuccess(null);

              if (mode === "signup" && values.password !== values.confirmPassword) {
                setError("Passwords do not match.");
                return;
              }

              try {
                if (firebaseAuth) {
                  if (mode === "signup") {
                    await createUserWithEmailAndPassword(firebaseAuth, values.email, values.password);
                    setSuccess("Account created. Your profile is now persisted and awaiting access approval.");
                    navigate("/unauthorized", { replace: true });
                    return;
                  }

                  await signInWithEmailAndPassword(firebaseAuth, values.email, values.password);
                  setBootstrapped(false);
                  navigate("/dashboard", { replace: true });
                  return;
                }

                if (mode === "login" && isDevFallbackEnabled()) {
                  setSession(buildDevSession(values.email));
                  navigate("/dashboard", { replace: true });
                  return;
                }

                setError("Firebase authentication is not configured for this environment.");
              } catch (authError) {
                setError(describeAuthError(authError, mode === "signup" ? "Account creation failed." : "Sign in failed."));
              }
            })}
          >
            <label className="auth-field">
              <span>Email</span>
              <Input aria-label="Email" autoComplete="email" placeholder="you@company.com" type="email" {...register("email", { required: true })} />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <Input
                aria-label="Password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                type="password"
                {...register("password", { required: true, minLength: 6 })}
              />
            </label>
            {mode === "signup" ? (
              <label className="auth-field">
                <span>Confirm password</span>
                <Input
                  aria-label="Confirm password"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  type="password"
                  {...register("confirmPassword", {
                    validate: (value) => value === password || "Passwords do not match."
                  })}
                />
              </label>
            ) : null}
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            {success ? <p className="auth-success">{success}</p> : null}
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? (mode === "signup" ? "Creating account..." : "Signing in...") : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <div className="auth-links">
            <Link to="/forgot-password">Forgot password</Link>
            {allowSignup ? (
              <button
                className="ghost-link ghost-link--button"
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  setSearchParams(mode === "signup" ? {} : { mode: "signup" });
                }}
              >
                {mode === "signup" ? "Already have an account?" : "Need an account?"}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
