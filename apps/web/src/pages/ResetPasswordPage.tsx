import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { confirmPasswordReset } from "firebase/auth";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { firebaseAuth } from "../lib/firebase";
import { useToast } from "../components/Toast";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const actionCode = useMemo(() => searchParams.get("oobCode") || "", [searchParams]);

  return (
    <div style={{ padding: 24 }}>
      <Card title="Reset Password">
        <p>Complete the Firebase reset flow with the action code from the email link.</p>
        <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
          <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" type="password" />
          <Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" type="password" />
          <Button
            onClick={async () => {
              if (!firebaseAuth || !actionCode) {
                toast.info("A valid Firebase reset link is required in this environment");
                return;
              }
              if (!password || password !== confirmPassword) {
                toast.error("Passwords must match");
                return;
              }
              await confirmPasswordReset(firebaseAuth, actionCode, password);
              toast.success("Password reset complete");
            }}
          >
            Reset password
          </Button>
        </div>
      </Card>
    </div>
  );
}
