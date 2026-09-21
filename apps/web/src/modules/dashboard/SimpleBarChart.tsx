import { EMPTY_COPY } from "./dashboardSections.ts";
import type { ChartSeries } from "./api.ts";

export function SimpleBarChart({
  title,
  rows,
  formatValue,
}: {
  title: string;
  rows: ChartSeries[];
  formatValue?: (value: number) => string;
}) {
  const visible = rows.filter((row) => row.value > 0);
  const max = Math.max(0, ...visible.map((row) => row.value));
  if (visible.length === 0 || max === 0) {
    return (
      <section className="chart-card">
        <h2>{title}</h2>
        <p className="empty-state">{EMPTY_COPY.charts}</p>
      </section>
    );
  }

  return (
    <section className="chart-card">
      <h2>{title}</h2>
      <ul className="bar-chart">
        {visible.map((row) => (
          <li key={row.label}>
            <span className="bar-label">{row.label.replaceAll("_", " ")}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
            </span>
            <strong>{formatValue ? formatValue(row.value) : String(row.value)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
