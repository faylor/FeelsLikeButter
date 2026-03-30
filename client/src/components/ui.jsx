import { T } from "../tokens.js";
import { STROKE_ICONS } from "../constants.js";

export function Rule({ style }) {
  return <div style={{ height: 1, background: T.rule, ...style }} />;
}

export function Label({ children, style }) {
  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: 10, fontWeight: 500, letterSpacing: "0.12em",
      textTransform: "uppercase", color: T.muted, ...style,
    }}>
      {children}
    </div>
  );
}

export function ScoreRing({ score }) {
  const r = 28, circ = 2 * Math.PI * r, pct = score / 100;
  const col = score >= 75
    ? T.strokes.Breaststroke.accent
    : score >= 50
    ? T.strokes.Butterfly.accent
    : T.red;
  return (
    <svg width={72} height={72} style={{ flexShrink: 0 }}>
      <circle cx={36} cy={36} r={r} fill="none" stroke={T.rule} strokeWidth={3} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={col} strokeWidth={3}
        strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
        strokeLinecap="round" transform="rotate(-90 36 36)" />
      <text x={36} y={36} dominantBaseline="middle" textAnchor="middle"
        style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, fontWeight: 700, fill: T.dark }}>
        {score}
      </text>
    </svg>
  );
}

export function StatusMark({ status }) {
  const map = {
    good:       ["#007A5E", "Good"],
    warning:    ["#C4610A", "Watch"],
    needs_work: [T.red,     "Fix"],
  };
  const [col, lbl] = map[status] || [T.muted, status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: col, display: "inline-block" }} />
      <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: col }}>
        {lbl}
      </span>
    </span>
  );
}

export function ThinBar({ value, color }) {
  return (
    <div style={{ height: 2, background: T.rule, borderRadius: 1, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width 0.9s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

export function StrokeChip({ stroke, active, onClick }) {
  const sc = T.strokes[stroke];
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "12px 4px 10px", border: "none", cursor: "pointer",
      background: active ? sc.accent : "transparent",
      color: active ? "#fff" : T.muted,
      borderBottom: active ? `2px solid ${sc.accent}` : "2px solid transparent",
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
      fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase",
      transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    }}>
      <span style={{ fontSize: 16, opacity: active ? 1 : 0.5 }}>{STROKE_ICONS[stroke]}</span>
      <span>{stroke}</span>
    </button>
  );
}

export function Btn({ children, onClick, variant = "primary", accent, style }) {
  const base = {
    border: "none", width: "100%", padding: "15px 24px", cursor: "pointer",
    fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    fontSize: 12, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase",
  };
  const variants = {
    primary:   { background: accent || "#111111", color: "#fff" },
    secondary: { background: "none", border: `1px solid ${T.rule}`, color: T.mid },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}
