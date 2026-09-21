export function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill status-${value.toLowerCase()}`}>{formatStatus(value)}</span>;
}

export function formatStatus(value: string): string {
  return value.replaceAll("_", " ");
}

export function formatKg(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  if (value === "Insufficient data") {
    return value;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return `${value} KG`;
  }

  return `${new Intl.NumberFormat("en-IN").format(numeric)} KG`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
