export default TargetsView;

import { useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { getTimes, EVENT_TURNS, EVENT_DISTANCE, EVENTS_NO_10_11 } from "../constants/competitionTimes.js";
import { parseTime, formatTime, gap, getStatus, requiredSplit50, flipTurnSaving, ageGroupKey } from "../lib/timeUtils.js";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  qualifies:     { color: "#007A5E", bg: "#EBF7F4", label: "Qualifies ✓" },
  consideration: { color: "#C4610A", bg: "#FFF5EB", label: "Consideration" },
  close:         { color: "#005EB8", bg: "#EEF4FF", label: "Close" },
  working:       { color: T.muted,   bg: T.offWhite, label: "Working towards" },
  none:          { color: T.muted,   bg: T.offWhite, label: "No PB entered" },
};

// ─── Flip turn benchmarks (seconds, wall to 5m breakout) ─────────────────────
const TURN_BENCHMARKS = {
  "Club developing (10–12)": 1.10,
  "Club competitive (13–15)": 0.90,
  "County standard (15+)":    0.75,
  "Regional / national":      0.60,
};

// ─── Single event row ─────────────────────────────────────────────────────────
function EventRow({ event, pb, qualTime, consTime, ageGroup, onSelect, selected }) {
  const pbSecs   = parseTime(pb);
  const qualSecs = parseTime(qualTime);
  const consSecs = parseTime(consTime);
  const status   = getStatus(pbSecs, qualSecs, consSecs);
  const cfg      = STATUS_CONFIG[status];
  const gapToQ   = pbSecs && qualSecs ? gap(pbSecs, qualSecs) : null;
  const gapToC   = pbSecs && consSecs ? gap(pbSecs, consSecs) : null;

  return (
    <div>
      <div
        onClick={() => onSelect(selected ? null : event)}
        style={{ display: "flex", alignItems: "center", padding: "12px 24px", borderBottom: `1px solid ${T.rule}`, cursor: "pointer", background: selected ? T.offWhite : T.white }}>
        {/* Status dot */}
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0, marginRight: 12 }} />

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark }}>{event}</div>
          {pbSecs && (
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginTop: 2 }}>
              PB {formatTime(pbSecs)}
              {gapToC !== null && gapToC > 0 && ` · ${gapToC.toFixed(2)}s to consideration`}
              {gapToC !== null && gapToC <= 0 && gapToQ !== null && gapToQ > 0 && ` · ${gapToQ.toFixed(2)}s to qualifying`}
            </div>
          )}
        </div>

        <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: cfg.color, background: cfg.bg, padding: "3px 8px" }}>
          {cfg.label}
        </span>
      </div>

      {/* Expanded detail */}
      {selected && (
        <EventDetail
          event={event} pb={pb} pbSecs={pbSecs}
          qualTime={qualTime} qualSecs={qualSecs}
          consTime={consTime} consSecs={consSecs}
          status={status}
        />
      )}
    </div>
  );
}

// ─── Expanded detail panel ────────────────────────────────────────────────────
function EventDetail({ event, pb, pbSecs, qualTime, qualSecs, consTime, consSecs, status }) {
  const turns   = EVENT_TURNS[event] || 0;
  const dist    = EVENT_DISTANCE[event] || 0;
  const splits  = dist > 0 ? dist / 50 : 0;
  const [turnTime, setTurnTime] = useState("0.90");

  const currentTurn = parseFloat(turnTime) || 0;

  // Target turn times
  const turnTargets = Object.entries(TURN_BENCHMARKS);

  // Required 50m split for each standard
  const splitCons = requiredSplit50(consSecs, dist);
  const splitQual = requiredSplit50(qualSecs, dist);
  const splitPb   = pbSecs && splits > 0 ? pbSecs / splits : null;

  return (
    <div style={{ background: T.offWhite, borderBottom: `1px solid ${T.rule}`, padding: "16px 24px" }}>

      {/* Time targets */}
      <Label style={{ marginBottom: 10 }}>Time targets</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          ["Your PB",       pb || "—",       T.dark],
          ["Consideration", consTime || "—", "#C4610A"],
          ["Qualifying",    qualTime || "—", "#007A5E"],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: T.white, padding: "10px 12px", border: `1px solid ${T.rule}` }}>
            <Label style={{ marginBottom: 4, fontSize: 9 }}>{lbl}</Label>
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 15, fontWeight: 300, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Required splits */}
      {splits > 1 && (
        <>
          <Label style={{ marginBottom: 10 }}>Required avg 50m split</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              ["Your current", splitPb ? formatTime(splitPb) : "—", T.dark],
              ["For consideration", splitCons ? formatTime(splitCons) : "—", "#C4610A"],
              ["For qualifying", splitQual ? formatTime(splitQual) : "—", "#007A5E"],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{ background: T.white, padding: "10px 12px", border: `1px solid ${T.rule}` }}>
                <Label style={{ marginBottom: 4, fontSize: 9 }}>{lbl}</Label>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 15, fontWeight: 300, color: col }}>{val}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Flip turn calculator */}
      {turns > 0 && (
        <>
          <Rule style={{ marginBottom: 16 }} />
          <Label style={{ marginBottom: 4 }}>Flip turn calculator</Label>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
            {turns} turn{turns > 1 ? "s" : ""} in this event. Enter current turn time (wall to 5m breakout) to see potential time savings.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Label style={{ whiteSpace: "nowrap" }}>Current turn time (s)</Label>
            <input
              type="number" step="0.05" min="0.4" max="2.0"
              value={turnTime}
              onChange={e => setTurnTime(e.target.value)}
              style={{ width: 70, background: T.white, border: `1px solid ${T.rule}`, padding: "7px 10px", fontSize: 13, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {turnTargets.map(([label, target]) => {
              const saving = flipTurnSaving(turns, currentTurn, target);
              if (saving <= 0) return null;
              const improvedPb   = pbSecs ? pbSecs - saving : null;
              const wouldQualify = improvedPb && qualSecs && improvedPb <= qualSecs;
              const wouldCons    = improvedPb && consSecs && improvedPb <= consSecs;
              return (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.white, border: `1px solid ${T.rule}` }}>
                  <div>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, fontWeight: 500, color: T.dark }}>{label}</div>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted }}>
                      {target}s/turn · save {saving.toFixed(2)}s total
                      {improvedPb && ` → ${formatTime(improvedPb)}`}
                    </div>
                  </div>
                  {(wouldQualify || wouldCons) && (
                    <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: wouldQualify ? "#007A5E" : "#C4610A", background: wouldQualify ? "#EBF7F4" : "#FFF5EB", padding: "3px 8px" }}>
                      {wouldQualify ? "Would qualify ✓" : "Would hit consideration"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main TargetsView ─────────────────────────────────────────────────────────
export function TargetsView({ profile, pbs, onSetupProfile }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filterGroup, setFilterGroup]     = useState("All");

  if (!profile) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center" }}>
        <Rule style={{ marginBottom: 32 }} />
        <Label style={{ display: "block", marginBottom: 8 }}>No profile set up</Label>
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 24 }}>
          Add your son's age, gender and personal bests to see how he compares against Surrey County 2027 standards.
        </p>
        <Btn onClick={onSetupProfile}>Set Up Profile →</Btn>
      </div>
    );
  }

  const ag       = ageGroupKey(profile.age);
  const { qualifying, consideration } = getTimes(profile.gender, profile.poolType);

  const GROUPS = ["All", "Freestyle", "Backstroke", "Breaststroke", "Butterfly", "Medley"];
  const GROUP_EVENTS = {
    Freestyle:    ["50m Freestyle","100m Freestyle","200m Freestyle","400m Freestyle","800m Freestyle","1500m Freestyle"],
    Backstroke:   ["50m Backstroke","100m Backstroke","200m Backstroke"],
    Breaststroke: ["50m Breaststroke","100m Breaststroke","200m Breaststroke"],
    Butterfly:    ["50m Butterfly","100m Butterfly","200m Butterfly"],
    Medley:       ["200m Individual Medley","400m Individual Medley"],
  };

  const eventsToShow = filterGroup === "All"
    ? Object.values(GROUP_EVENTS).flat()
    : GROUP_EVENTS[filterGroup] || [];

  // Summary counts
  const counts = { qualifies: 0, consideration: 0, close: 0, working: 0 };
  Object.values(GROUP_EVENTS).flat().forEach(event => {
    const pbSecs   = parseTime(pbs?.[event]);
    const qualSecs = parseTime(qualifying[event]?.[ag]);
    const consSecs = parseTime(consideration[event]?.[ag]);
    const s = getStatus(pbSecs, qualSecs, consSecs);
    if (s !== "none") counts[s]++;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "32px 24px 20px" }}>
        <Label style={{ color: T.red, marginBottom: 6 }}>Surrey County 2027</Label>
        <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 4 }}>
          {profile.name}'s Targets
        </div>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginBottom: 20 }}>
          Age {profile.age} · {profile.gender === "MALE" ? "Male/Open" : "Female"} · {profile.poolType === "LONG" ? "Long course" : "Short course"} · Age group {ag}
        </div>
        <Rule />
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 8, padding: "0 24px 20px", flexWrap: "wrap" }}>
        {[
          ["qualifies", "#007A5E", "#EBF7F4"],
          ["consideration", "#C4610A", "#FFF5EB"],
          ["close", "#005EB8", "#EEF4FF"],
          ["working", T.muted, T.offWhite],
        ].map(([key, col, bg]) => counts[key] > 0 && (
          <div key={key} style={{ background: bg, padding: "5px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: col }} />
            <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: col, fontWeight: 500 }}>
              {counts[key]} {key.replace("_", " ")}
            </span>
          </div>
        ))}
        <button onClick={onSetupProfile} style={{ marginLeft: "auto", background: "none", border: `1px solid ${T.rule}`, color: T.mid, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
          Edit profile
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", overflowX: "auto", borderBottom: `1px solid ${T.rule}`, marginBottom: 0 }}>
        {GROUPS.map(g => (
          <button key={g} onClick={() => { setFilterGroup(g); setSelectedEvent(null); }} style={{
            padding: "10px 16px", border: "none", cursor: "pointer", background: "none", whiteSpace: "nowrap",
            fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, fontWeight: 500,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: filterGroup === g ? T.dark : T.muted,
            borderBottom: `2px solid ${filterGroup === g ? T.dark : "transparent"}`,
          }}>{g}</button>
        ))}
      </div>

      {/* Event rows */}
      <div>
        {eventsToShow.map(event => {
          const skip = EVENTS_NO_10_11.includes(event) && ag === "10/11";
          if (skip) return null;
          const qualTime = qualifying[event]?.[ag];
          const consTime = consideration[event]?.[ag];
          if (!qualTime && !consTime) return null;
          return (
            <EventRow
              key={event}
              event={event}
              pb={pbs?.[event]}
              qualTime={qualTime}
              consTime={consTime}
              ageGroup={ag}
              selected={selectedEvent === event}
              onSelect={setSelectedEvent}
            />
          );
        })}
      </div>

      <div style={{ padding: "20px 24px" }}>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
          Tap any event to see required splits, flip turn analysis, and gap to each standard. Times from Surrey County Age Group Championships 2027.
        </div>
      </div>
    </div>
  );
}

