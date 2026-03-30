import { useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, ThinBar } from "./ui.jsx";

export function HistoryView({ sessions }) {
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All"
    ? sessions
    : sessions.filter((s) => s.stroke === filter);

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
            <button key={s} onClick={() => setFilter(s)} style={{
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
        {!filtered.length
          ? (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <Label style={{ display: "block" }}>No sessions yet</Label>
            </div>
          )
          : filtered.map((s, i) => {
            const sc = T.strokes[s.stroke];
            return (
              <div key={s.id} style={{ paddingBottom: 20, marginBottom: 20, borderBottom: i < filtered.length - 1 ? `1px solid ${T.rule}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <Label style={{ color: sc.accent, marginBottom: 4 }}>{s.stroke}</Label>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
                      {new Date(s.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 28, fontWeight: 300, color: T.dark, lineHeight: 1 }}>
                    {s.score}
                  </div>
                </div>

                <ThinBar value={s.score} color={sc.accent} />

                <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.6, margin: "10px 0 8px" }}>
                  {s.summary}
                </p>

                {s.note && (
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, fontStyle: "italic" }}>
                    {s.note}
                  </div>
                )}

                <div style={{ marginTop: 10, padding: "10px 14px", background: T.offWhite }}>
                  <Label style={{ marginBottom: 4, color: sc.accent }}>Priority</Label>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark }}>
                    {s.topPriority}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
