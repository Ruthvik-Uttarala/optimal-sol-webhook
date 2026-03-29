import type { ReactNode } from "react";

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (value: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className="input"
          style={{
            cursor: "pointer",
            borderColor: active === tab ? "var(--accent-ginger-500)" : "var(--border-default)",
            color: active === tab ? "var(--accent-cocoa-700)" : "var(--text-secondary)"
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 12 }}>{children}</div>;
}
