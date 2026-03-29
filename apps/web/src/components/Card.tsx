import type { ReactNode } from "react";

export function Card({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  return (
    <section className="card">
      {(title || action) && (
        <div className="page-head">
          <h3 style={{ margin: 0 }}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
