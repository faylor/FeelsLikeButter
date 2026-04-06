import { useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, ThinBar, StatusMark, ScoreRing } from "./ui.jsx";
import { CompareView } from "./CompareView.jsx";

export function HistoryView({ sessions }) {
  const [filter, setFilter]       = useState("All");
  const [expanded, setExpanded]   = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected]   = useState([]);   // up to 2 session ids
  const [comparing, setComparing] = useState(null); // { a, b }

  const filtered = filter === "All"
    ? sessions
    : sessions.filter((s) => s.stroke === filter);

  const toggle = (id) => {
    if (!compareMode) {
      setExpanded(prev => prev === id ? null : id);
      return;
    }
    // Compare mode -- select up to 2
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const startCompare = () => {
    const [a, b] = selected.map(id => sessions.find(s => s.id === id));
    if (a && b) setComparing({ a, b });
  };

  const exitCompare = () => {
    setCompareMode(false);
    setSelected([]);
    setComparing(null);
  };

  if (comparing) {
    return <CompareView sessionA={comparing.a} sessionB={comparing.b} onClose={() => setComparing(null)} />;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "32px 24px 20px" }}>
        <Label style={{ marginBottom: 6 }}>All sessions</Label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black }}>
            History
          </div>
          {sessions.length >= 2 && (
            <button onClick={() => { setCompareMode(m => !m); setSelected([]); setExpanded(null); }}
              style={{ background: compareMode ? T.dark : "none", color: compareMode ? "#fff" : T.mid, border: `1px solid ${compareMode ? T.dark : T.rule}`, padding: "6px 14px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
              {compareMode ? "Cancel" : "Compare"}
            </button>
          )}
        </div>
        <Rule />
      </div>

      {/* Compare toolbar */}
      {compareMode && (
        <div style={{ margin: "0 24px 16px", padding: "12px 16px", background: T.offWhite, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid }}>
            {selected.length === 0 && "Tap two sessions to compare"}
            {selected.length === 1 && "Select one more session"}
            {selected.length === 2 && "Ready to compare"}
          </span>
          <button
            onClick={startCompare}
            disabled={selected.length !== 2}
            style={{ background: selected.length === 2 ? T.dark : T.rule, color: selected.length === 2 ? "#fff" : T.muted, border: "none", padding: "7px 16px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: selected.length === 2 ? "pointer" : "default", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
            Compare &rarr;
          </button>
        </div>
      )}

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
          const isSelected = selected.includes(s.id);

          return (
            <div key={s.id} style={{ marginBottom: 0, borderBottom: i < filtered.length - 1 ? `1px solid ${T.rule}` : "none", background: isSelected ? sc.light : T.white }}>

              {/* --- Summary row --- */}
              <div
                onClick={() => toggle(s.id)}
                style={{ paddingBottom: 16, paddingTop: i === 0 ? 0 : 16, cursor: "pointer", paddingLeft: 0, paddingRight: 0 }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
                    {/* Compare mode selection indicator */}
                    {compareMode && (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isSelected ? sc.accent : T.rule}`, background: isSelected ? sc.accent : "none", flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                      </div>
                    )}
                    <div>
                      <Label style={{ color: sc.accent, marginBottom: 4 }}>{s.stroke}</Label>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
                        {new Date(s.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 28, fontWeight: 300, color: T.dark, lineHeight: 1 }}>
                      {s.score}
                    </div>
                    {!compareMode && (
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, color: T.muted, lineHeight: 1, marginTop: 2 }}>
                        {isOpen ? "^" : "v"}
                      </div>
                    )}
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

                  {/* Frames strip */}
                  {s.frames?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                        {s.frames.length} frames analysed
                      </div>
                      <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
                        {s.frames.map((f, i) => (
                          <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                            <img
                              src={`data:image/jpeg;base64,${f.preview}`}
                              style={{ height: 52, width: "auto", objectFit: "cover", display: "block", border: `1px solid ${f.tracked ? "#007A5E" : T.rule}` }}
                              alt={`Frame ${i + 1}`}
                            />
                            {f.angles?.length > 0 && (
                              <div style={{ position: "absolute", bottom: 2, right: 2, width: 6, height: 6, borderRadius: "50%", background: "#E63946" }} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted, marginTop: 4 }}>
                        Green border = swimmer tracked. Red dot = kinematics detected.
                      </div>
                    </div>
                  )}

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
