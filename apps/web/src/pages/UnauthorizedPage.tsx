import { Card } from "../components/Card";

export function UnauthorizedPage() {
  return (
    <div style={{ padding: 24 }}>
      <Card title="Unauthorized">
        <p>You do not have access to this page.</p>
      </Card>
    </div>
  );
}
