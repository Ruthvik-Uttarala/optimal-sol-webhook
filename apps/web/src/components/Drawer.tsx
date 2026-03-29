import type { ReactNode } from "react";

export function Drawer({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <aside style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: "min(520px, 95vw)", background: "var(--bg-surface-strong)", borderLeft: "1px solid var(--border-default)", padding: 16, zIndex: 40 }}>
      <h3>{title}</h3>
      {children}
    </aside>
  );
}
