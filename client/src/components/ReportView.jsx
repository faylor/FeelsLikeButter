import { T } from "../tokens.js";
import { STROKE_ICONS } from "../constants/strokes.js";
import { Rule, Label, ThinBar } from "./ui.jsx";

export function ReportView({ sessions }) {
  const byStroke = (s) => sessions.filter((x) => x.stroke === s);
  const avgScore = (s) => {
    const ss = byStroke(s);
    return ss.length ? Math.round(ss.reduce((a, x) => a + x.score, 0) / ss.length) : null;
  };

  const strokeKeys = Object.keys(T.strokes);
  const activeStrokes = strokeKeys.filter((s) => byStroke(s).length > 0);

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "32px 24px 20px" }}>
        <Label style={{ marginBottom: 6, color: T.red }}>Competition</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 4 }}>
          Pre-Meet Report
        </div>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginBottom: 20 }}>
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
        <Rule />
      </div>

      {!activeStrokes.length && (
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <Label style={{ display: "block" }}>No data yet — analyze some videos first</Label>
        </div>
      )}

      <div style={{ padding: "20px 24px 0" }}>
        {activeStrokes.map((s, si) => {
          const ss = byStroke(s);
          const sc = T.strokes[s];
          const a = avgScore(s);
          const latest = ss[0];
          const trend = ss.length >= 2 ? latest.score - ss[ss.length - 1].score : null;
          const problems = [
            ...new Map(
              ss.flatMap((x) => x.items || [])
                .filter((item) => item.status === "needs_work")
                .map((item) => [item.name, item])
            ).values(),
          ].slice(0, 2);

          return (
            <div key={s} style={{ marginBottom: 32, paddingBottom: 32, borderBottom: si < activeStrokes.length - 1 ? `1px solid ${T.rule}` : "none" }}>

              {/* Stroke header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 20, color: sc.accent, marginBottom: 8, fontWeight: 300 }}>{STROKE_ICONS[s]}</div>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 14, fontWeight: 500, color: T.dark }}>{s}</div>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginTop: 2 }}>
                    {ss.length} session{ss.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 36, fontWeight: 300, color: T.dark, lineHeight: 1 }}>{a}</div>
                  {trend !== null && (
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: trend >= 0 ? "#007A5E" : T.red, marginTop: 4 }}>
                      {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)} pts
                    </div>
                  )}
                </div>
              </div>

              <ThinBar value={a} color={sc.accent} />

              {/* Focus box */}
              <div style={{ marginTop: 16, padding: "12px 16px", background: sc.light, borderLeft: `2px solid ${sc.accent}` }}>
                <Label style={{ marginBottom: 4, color: sc.accent }}>Focus for meet</Label>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark, lineHeight: 1.5 }}>
                  {latest.topPriority}
                </div>
              </div>

              {/* Recurring issues */}
              {problems.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <Label style={{ marginBottom: 10, color: T.red }}>Recurring issues</Label>
                  {problems.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.red, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.5 }}>
                        <strong style={{ color: T.dark }}>{p.name}.</strong> {p.feedback}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
