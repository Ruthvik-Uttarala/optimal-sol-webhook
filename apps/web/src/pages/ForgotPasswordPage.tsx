import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useState } from "react";
import { firebaseAuth } from "../lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { useToast } from "../components/Toast";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const toast = useToast();

  return (
    <div style={{ padding: 24 }}>
      <Card title="Forgot Password">
        <p>Request a Firebase Auth password reset link for the current account.</p>
        <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" />
          <Button
            onClick={async () => {
              if (!firebaseAuth) {
                toast.info("Firebase auth is not configured in this environment");
                return;
              }
              await sendPasswordResetEmail(firebaseAuth, email);
              toast.success("Reset email sent");
            }}
          >
            Send reset email
          </Button>
        </div>
      </Card>
    </div>
  );
}
