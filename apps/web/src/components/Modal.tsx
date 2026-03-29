import type { ReactNode } from "react";

export function Modal({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 50 }}>
      <div className="card" style={{ width: "min(720px, 95vw)" }}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
