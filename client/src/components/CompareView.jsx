import { T } from "../tokens.js";
import { Rule, Label, ThinBar } from "./ui.jsx";

function ScoreDot({ score }) {
  const col = score >= 75 ? "#007A5E" : score >= 50 ? "#C4610A" : T.red;
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: col, color: "#fff", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
      fontSize: 13, fontWeight: 700,
    }}>{score}</div>
  );
}

export function CompareView({ sessionA, sessionB, onClose }) {
  const scA = T.strokes[sessionA.stroke] || T.strokes.Freestyle;
  const scB = T.strokes[sessionB.stroke] || T.strokes.Freestyle;

  // Build a merged item list by name
  const allNames = [
    ...new Set([
      ...(sessionA.items || []).map(i => i.name),
      ...(sessionB.items || []).map(i => i.name),
    ])
  ];

  const winner = sessionA.score >= sessionB.score ? "A" : "B";
  const diff   = Math.abs(sessionA.score - sessionB.score);

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ padding: "32px 24px 20px" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Side by Side</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 20 }}>
          Comparison
        </div>
        <Rule />
      </div>

      {/* Overall scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: T.rule, margin: "0 24px 24px", border: `1px solid ${T.rule}` }}>
        {[["A", sessionA, scA], ["B", sessionB, scB]].map(([label, s, sc]) => (
          <div key={label} style={{ background: winner === label ? sc.light : T.white, padding: "16px 14px" }}>
            <Label style={{ color: sc.accent, marginBottom: 8 }}>
              Swimmer {label} {winner === label ? "-- Winner" : ""}
            </Label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <ScoreDot score={s.score} />
              <div>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, fontWeight: 500, color: T.dark }}>{s.stroke}</div>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted }}>
                  {new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
            </div>
            <ThinBar value={s.score} color={sc.accent} />
            <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.mid, lineHeight: 1.5, margin: "8px 0 0" }}>
              {s.summary}
            </p>
          </div>
        ))}
      </div>

      {/* Gap callout */}
      <div style={{ margin: "0 24px 24px", padding: "12px 16px", background: T.offWhite, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark }}>
          Overall gap
        </span>
        <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 18, fontWeight: 300, color: diff > 15 ? T.red : diff > 5 ? "#C4610A" : "#007A5E" }}>
          {diff} points
        </span>
      </div>

      {/* Technique item comparison */}
      <div style={{ padding: "0 24px" }}>
        <Label style={{ marginBottom: 16 }}>Item by item</Label>

        {allNames.map((name, i) => {
          const iA = (sessionA.items || []).find(x => x.name === name);
          const iB = (sessionB.items || []).find(x => x.name === name);
          const scoreA = iA?.score ?? null;
          const scoreB = iB?.score ?? null;
          const aWins = scoreA !== null && scoreB !== null && scoreA > scoreB;
          const bWins = scoreA !== null && scoreB !== null && scoreB > scoreA;
          const tied  = scoreA !== null && scoreB !== null && scoreA === scoreB;

          return (
            <div key={name} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: i < allNames.length - 1 ? `1px solid ${T.rule}` : "none" }}>
              {/* Item name + winner badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark, flex: 1, lineHeight: 1.4 }}>
                  {name}
                </div>
                {(aWins || bWins || tied) && (
                  <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: tied ? T.muted : "#007A5E", background: tied ? T.offWhite : "#EBF7F4", padding: "2px 8px", whiteSpace: "nowrap" }}>
                    {tied ? "Tied" : `${aWins ? "A" : "B"} +${Math.abs((scoreA ?? 0) - (scoreB ?? 0))}`}
                  </span>
                )}
              </div>

              {/* Two bars */}
              {[["A", iA, scA, aWins], ["B", iB, scB, bWins]].map(([label, item, sc, wins]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, fontWeight: 700, color: wins ? sc.accent : T.muted, width: 14 }}>{label}</span>
                    <div style={{ flex: 1 }}>
                      <ThinBar
                        value={item?.score ?? 0}
                        color={item?.status === "good" ? "#007A5E" : item?.status === "warning" ? "#C4610A" : T.red}
                      />
                    </div>
                    <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.mid, width: 24, textAlign: "right" }}>
                      {item?.score ?? "--"}
                    </span>
                  </div>
                  {item?.feedback && (
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.mid, paddingLeft: 22, lineHeight: 1.4 }}>
                      {item.feedback}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Priority summary */}
      <div style={{ margin: "8px 24px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[["A", sessionA, scA], ["B", sessionB, scB]].map(([label, s, sc]) => (
          <div key={label} style={{ padding: "12px 14px", background: sc.light, borderLeft: `2px solid ${sc.accent}` }}>
            <Label style={{ color: sc.accent, marginBottom: 6 }}>Swimmer {label} -- fix first</Label>
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.dark, lineHeight: 1.5 }}>
              {s.topPriority || "--"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
