import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { firebaseAuth } from "../lib/firebase";
import { useSessionStore } from "../store/useSessionStore";
import type { GlobalRole, SessionProfile } from "../types/app";

interface LoginValues {
  email: string;
  password: string;
}

function buildDevSession(email: string) {
  const role: GlobalRole = email.includes("support")
    ? "support"
    : email.includes("operator")
      ? "operator"
      : email.includes("manager")
        ? "manager"
        : "admin";

  return {
    uid: `uid_${role}_001`,
    email,
    displayName: role.toUpperCase(),
    role,
    status: "active",
    defaultLotId: "lot_demo_001",
    defaultOrganizationId: "org_demo_001",
    notificationPreferences: null,
    access: [
      {
        id: `access_${role}_001`,
        organizationId: "org_demo_001",
        lotId: "lot_demo_001",
        roleWithinLot: role,
        status: "active"
      }
    ],
    currentLotId: "lot_demo_001",
    currentOrganizationId: "org_demo_001",
    authMode: "dev" as const
  } satisfies SessionProfile;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    defaultValues: { email: "admin@parkingsol.local", password: "Password123!" }
  });
  const user = useSessionStore((state) => state.user);
  const setSession = useSessionStore((state) => state.setSession);

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 }}>
      <Card title="Login">
        <form
          onSubmit={handleSubmit(async (values) => {
            setError(null);
            try {
              if (firebaseAuth) {
                await signInWithEmailAndPassword(firebaseAuth, values.email, values.password);
                navigate("/dashboard");
                return;
              }

              if (import.meta.env.DEV || (import.meta.env.VITE_ENV_LABEL || "").toLowerCase().includes("test")) {
                setSession(buildDevSession(values.email));
                navigate("/dashboard");
                return;
              }

              setError("Firebase authentication is not configured for this environment");
            } catch (err) {
              const fallback = buildDevSession(values.email);
              if (import.meta.env.DEV || (import.meta.env.VITE_ENV_LABEL || "").toLowerCase().includes("test")) {
                setSession(fallback);
                navigate("/dashboard");
                return;
              }

              setError(err instanceof Error ? err.message : "Sign in failed");
            }
          })}
          style={{ display: "grid", gap: 10, width: 320 }}
        >
          <Input aria-label="Email" placeholder="Email" type="email" {...register("email", { required: true })} />
          <Input aria-label="Password" placeholder="Password" type="password" {...register("password", { required: true })} />
          {error ? <p role="alert" style={{ margin: 0, color: "var(--status-unpaid)" }}>{error}</p> : null}
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/forgot-password">Forgot password</a>
          <a href="/reset-password">Reset password</a>
        </div>
      </Card>
    </div>
  );
}
