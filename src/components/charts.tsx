import type { ReactNode } from "react";

// Hand-written SVG charts that use the design tokens (no chart library). Each one sits in a figure with a
// visible text summary, so the numbers are readable without seeing the drawing.

const W = 560;
const H = 150;
const PAD = { l: 28, r: 8, t: 10, b: 22 };
const innerW = W - PAD.l - PAD.r;
const innerH = H - PAD.t - PAD.b;

export function Figure({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <figure className="mb-8">
      <figcaption className="mb-1 font-serif text-lg italic">{title}</figcaption>
      {children}
      <p className="mt-1 text-xs text-ink-soft">{summary}</p>
    </figure>
  );
}

function Frame({ label, ticks, children }: { label: string; ticks: { y: number; text: string }[]; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full max-w-xl text-ink-faint">
      {ticks.map((t) => (
        <g key={t.text}>
          <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke="var(--rule)" strokeWidth="1" />
          <text x={PAD.l - 4} y={t.y + 3} textAnchor="end" fontSize="9" fill="currentColor">{t.text}</text>
        </g>
      ))}
      {children}
    </svg>
  );
}

const x = (i: number, n: number) => PAD.l + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
const bandX = (i: number, n: number) => PAD.l + (i * innerW) / n;

const short = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Bars per week with an optional dashed reference line (the budget). */
export function BarChart({ label, data, max, line, format = (v: number) => String(v) }: { label: string; data: { label: string; value: number | null; ghost?: number }[]; max: number; line?: { value: number; text: string }; format?: (v: number) => string }) {
  const y = (v: number) => PAD.t + innerH - (Math.min(v, max) / max) * innerH;
  const bw = (innerW / data.length) * 0.6;
  return (
    <Frame label={label} ticks={[{ y: y(0), text: "0" }, { y: y(max / 2), text: format(Math.round(max / 2)) }, { y: y(max), text: format(max) }]}>
      {data.map((d, i) => {
        const cx = bandX(i, data.length) + innerW / data.length / 2;
        return (
          <g key={d.label}>
            {d.ghost !== undefined && <rect x={cx - bw / 2} y={y(d.ghost)} width={bw} height={y(0) - y(d.ghost)} fill="none" stroke="var(--rule-strong)" strokeDasharray="3 2" />}
            {d.value !== null && <rect x={cx - bw / 2} y={y(d.value)} width={bw} height={Math.max(0, y(0) - y(d.value))} fill="var(--accent)" opacity="0.85" rx="1.5" />}
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="9" fill="currentColor">{short(d.label)}</text>
          </g>
        );
      })}
      {line && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(line.value)} y2={y(line.value)} stroke="var(--warn)" strokeWidth="1.2" strokeDasharray="5 3" />
          <text x={W - PAD.r} y={y(line.value) - 3} textAnchor="end" fontSize="9" fill="var(--warn)">{line.text}</text>
        </g>
      )}
    </Frame>
  );
}

const PALETTE = ["var(--accent)", "var(--margin)", "var(--ok)", "var(--warn)", "var(--ink-soft)"];

/** One line per series over weeks; a series with a single point is drawn as a dot. */
export function LineChart({ label, weeks, series, hline }: { label: string; weeks: string[]; series: { name: string; points: { weekStart: string; value: number }[] }[]; hline?: { value: number; text: string } }) {
  const y = (v: number) => PAD.t + innerH - (Math.max(0, Math.min(v, 100)) / 100) * innerH;
  return (
    <Frame label={label} ticks={[{ y: y(0), text: "0" }, { y: y(50), text: "50" }, { y: y(100), text: "100" }]}>
      {hline && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(hline.value)} y2={y(hline.value)} stroke="var(--warn)" strokeWidth="1.2" strokeDasharray="5 3" />
          <text x={W - PAD.r} y={y(hline.value) - 3} textAnchor="end" fontSize="9" fill="var(--warn)">{hline.text}</text>
        </g>
      )}
      {weeks.map((w, i) => (i % 2 === (weeks.length - 1) % 2 ? <text key={w} x={x(i, weeks.length)} y={H - 6} textAnchor="middle" fontSize="9" fill="currentColor">{short(w)}</text> : null))}
      {series.map((s, k) => {
        const pts = s.points.map((p) => ({ cx: x(Math.max(0, weeks.indexOf(p.weekStart)), weeks.length), cy: y(p.value) }));
        const color = PALETTE[k % PALETTE.length];
        return (
          <g key={s.name} stroke={color} fill={color}>
            {pts.length > 1 && <polyline points={pts.map((p) => `${p.cx},${p.cy}`).join(" ")} fill="none" strokeWidth="1.6" strokeLinejoin="round" />}
            {pts.map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r="2.2" stroke="none" />)}
          </g>
        );
      })}
    </Frame>
  );
}

export function Legend({ names }: { names: string[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
      {names.map((n, k) => (
        <li key={n} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: PALETTE[k % PALETTE.length] }} />{n}</li>
      ))}
    </ul>
  );
}

/** Habits by week: the shade is the weekly percentage, and a cell at or above the target is outlined (the 80 % line). */
export function Heatmap({ label, weeks, rows }: { label: string; weeks: string[]; rows: { name: string; target: number; weeks: (number | null)[] }[] }) {
  const cw = Math.min(46, (W - 150) / weeks.length);
  const rowH = 24;
  const h = rows.length * rowH + 22;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label} className="h-auto w-full max-w-xl text-ink-faint">
      {weeks.map((w, i) => <text key={w} x={150 + i * cw + cw / 2} y={11} textAnchor="middle" fontSize="9" fill="currentColor">{short(w)}</text>)}
      {rows.map((r, j) => (
        <g key={r.name} transform={`translate(0 ${18 + j * rowH})`}>
          <text x={0} y={14} fontSize="10" fill="var(--ink)" className="text-ink">{r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name}</text>
          {r.weeks.map((v, i) => (
            <g key={i}>
              <rect x={150 + i * cw + 1} y={1} width={cw - 2} height={rowH - 4} rx="2" fill={v === null ? "var(--paper-2)" : "var(--accent)"} opacity={v === null ? 1 : 0.15 + 0.85 * Math.min(1, v / 100)} />
              {v !== null && v >= r.target && <rect x={150 + i * cw + 1} y={1} width={cw - 2} height={rowH - 4} rx="2" fill="none" stroke="var(--ink)" strokeWidth="1" />}
              {v !== null && <text x={150 + i * cw + cw / 2} y={14} textAnchor="middle" fontSize="9" fill="var(--ink)">{v}</text>}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
