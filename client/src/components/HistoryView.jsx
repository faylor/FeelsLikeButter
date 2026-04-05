import { useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, ThinBar, StatusMark, ScoreRing } from "./ui.jsx";

export function HistoryView({ sessions }) {
  const [filter, setFilter]       = useState("All");
  const [expanded, setExpanded]   = useState(null);

  const filtered = filter === "All"
    ? sessions
    : sessions.filter((s) => s.stroke === filter);

  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "32px 24px 20px" }}>
        <Label style={{ marginBottom: 6 }}>All sessions</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 20 }}>
          History
        </div>
        <Rule />
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, padding: "0 24px 20px", overflowX: "auto" }}>
        {["All", ...Object.keys(T.strokes)].map((s) => {
          const isActive = filter === s;
          const col = s === "All" ? T.dark : T.strokes[s].accent;
          return (
            <button key={s} onClick={() => { setFilter(s); setExpanded(null); }} style={{
              padding: "6px 16px", border: `1px solid ${isActive ? col : T.rule}`,
              background: isActive ? col : "none", color: isActive ? "#fff" : T.mid,
              fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
              fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
            }}>
              {s}
            </button>
          );
        })}
      </div>

      {/* Session list */}
      <div style={{ padding: "0 24px" }}>
        {!filtered.length ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <Label style={{ display: "block" }}>No sessions yet</Label>
          </div>
        ) : filtered.map((s, i) => {
          const sc = T.strokes[s.stroke];
          const isOpen = expanded === s.id;

          return (
            <div key={s.id} style={{ marginBottom: 0, borderBottom: i < filtered.length - 1 ? `1px solid ${T.rule}` : "none" }}>

              {/* --- Summary row (always visible, tap to expand) --- */}
              <div
                onClick={() => toggle(s.id)}
                style={{ paddingBottom: 16, paddingTop: i === 0 ? 0 : 16, cursor: "pointer" }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <Label style={{ color: sc.accent, marginBottom: 4 }}>{s.stroke}</Label>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
                      {new Date(s.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 28, fontWeight: 300, color: T.dark, lineHeight: 1 }}>
                      {s.score}
                    </div>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, color: T.muted, lineHeight: 1, marginTop: 2 }}>
                      {isOpen ? "^" : "v"}
                    </div>
                  </div>
                </div>

                <ThinBar value={s.score} color={sc.accent} />

                <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.6, margin: "10px 0 8px" }}>
                  {s.summary}
                </p>

                {s.note && (
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, fontStyle: "italic", marginBottom: 8 }}>
                    {s.note}
                  </div>
                )}

                <div style={{ padding: "10px 14px", background: T.offWhite }}>
                  <Label style={{ marginBottom: 4, color: sc.accent }}>Priority</Label>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark }}>
                    {s.topPriority}
                  </div>
                </div>
              </div>

              {/* --- Expanded detail --- */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${T.rule}`, paddingTop: 20, paddingBottom: 20 }}>

                  {/* Score ring + summary */}
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
                    <ScoreRing score={s.score} />
                    <div style={{ flex: 1 }}>
                      <Label style={{ color: sc.accent, marginBottom: 4 }}>Full breakdown</Label>
                      <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.6, margin: 0 }}>
                        {s.summary}
                      </p>
                    </div>
                  </div>

                  <Rule style={{ marginBottom: 16 }} />

                  {/* Technique items */}
                  {s.items?.length > 0 ? s.items.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: idx < s.items.length - 1 ? `1px solid ${T.rule}` : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 10 }}>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark, flex: 1, lineHeight: 1.4 }}>
                          {item.name}
                        </div>
                        <StatusMark status={item.status} />
                      </div>
                      <ThinBar value={item.score} color={item.status === "good" ? "#007A5E" : item.status === "warning" ? "#C4610A" : T.red} />
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, marginTop: 6, lineHeight: 1.5 }}>
                        {item.feedback}
                      </div>
                      {item.status !== "good" && item.drill && (
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: sc.accent, marginTop: 4 }}>
                          Drill -- {item.drill}
                        </div>
                      )}
                    </div>
                  )) : (
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted }}>
                      No detailed breakdown saved for this session.
                    </div>
                  )}

                  {/* Collapse button */}
                  <button
                    onClick={() => setExpanded(null)}
                    style={{ marginTop: 8, width: "100%", padding: "10px", background: "none", border: `1px solid ${T.rule}`, color: T.mid, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
                    Collapse
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
