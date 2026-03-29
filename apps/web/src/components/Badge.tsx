import clsx from "clsx";

export function Badge({ label, tone = "info" }: { label: string; tone?: "paid" | "pending" | "unpaid" | "info" | "test" | "production" }) {
  return (
    <span className="status-chip" style={{ color: toneColor(tone), borderColor: toneColor(tone) }}>
      <span aria-hidden>●</span>
      {label}
    </span>
  );
}

function toneColor(tone: string) {
  if (tone === "paid") return "var(--status-paid)";
  if (tone === "pending") return "var(--status-pending)";
  if (tone === "unpaid") return "var(--status-unpaid)";
  if (tone === "test") return "var(--status-test)";
  if (tone === "production") return "var(--status-production)";
  return "var(--status-info)";
}

export function StatusChip({ text, tone }: { text: string; tone: "paid" | "pending" | "unpaid" | "info" | "test" | "production" }) {
  return <Badge label={text} tone={tone} />;
}
