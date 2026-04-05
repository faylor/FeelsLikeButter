import { T } from "../tokens.js";
import { STROKE_ICONS } from "../constants.js";
import { Rule, Label, ThinBar, Btn } from "./ui.jsx";

export function HomeView({ sessions, onAnalyze, onReport, onStrokeSelect }) {
  const byStroke = (s) => sessions.filter((x) => x.stroke === s);
  const avgScore = (s) => {
    const ss = byStroke(s);
    return ss.length ? Math.round(ss.reduce((a, x) => a + x.score, 0) / ss.length) : null;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "40px 24px 24px" }}>
        <Label style={{ color: T.red, marginBottom: 10 }}>Competitive Swimming</Label>
        <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1.15, color: T.black, marginBottom: 20 }}>
          Swim<br />Analyzer
        </div>
        <Rule />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#007A5E" }} />
          <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.mid, letterSpacing: "0.06em" }}>
            Face blurring before every upload
          </span>
        </div>
      </div>

      {/* Stroke grid */}
      <div style={{ padding: "0 24px" }}>
        <Label style={{ marginBottom: 14 }}>Your strokes</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: T.rule, border: `1px solid ${T.rule}` }}>
          {Object.keys(T.strokes).map((s) => {
            const sc = T.strokes[s];
            const a = avgScore(s);
            const cnt = byStroke(s).length;
            return (
              <div key={s} onClick={() => onStrokeSelect(s)}
                style={{ background: T.white, padding: "20px 16px", cursor: "pointer" }}>
                <div style={{ fontSize: 20, color: sc.accent, marginBottom: 12, fontWeight: 300 }}>{STROKE_ICONS[s]}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.dark, marginBottom: 2 }}>{s}</div>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: a !== null ? 12 : 0 }}>
                  {cnt} session{cnt !== 1 ? "s" : ""}
                </div>
                {a !== null && (
                  <>
                    <ThinBar value={a} color={sc.accent} />
                    <div style={{ fontSize: 11, color: T.mid, marginTop: 6 }}>Score {a}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: "24px 24px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={onAnalyze}>Analyze New Video</Btn>
        {sessions.length > 0 && (
          <Btn onClick={onReport} variant="secondary">Pre-Meet Report</Btn>
        )}
      </div>
    </div>
  );
}
