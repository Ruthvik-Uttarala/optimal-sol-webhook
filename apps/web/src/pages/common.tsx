import type { ReactNode } from "react";

export function PageState({ loading, error, empty, children }: { loading?: boolean; error?: string | null; empty?: boolean; children: ReactNode }) {
  if (loading) return <div className="card">Loading...</div>;
  if (error) return <div className="card">Error: {error}</div>;
  if (empty) return <div className="card">No data available.</div>;
  return <>{children}</>;
}
