import { useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { EVENTS, EVENTS_NO_10_11 } from "../constants/competitionTimes.js";
import { ageGroupKey } from "../lib/timeUtils.js";

const STROKES_GROUPED = [
  { group: "Freestyle",    events: ["50m Freestyle","100m Freestyle","200m Freestyle","400m Freestyle","800m Freestyle","1500m Freestyle"] },
  { group: "Backstroke",   events: ["50m Backstroke","100m Backstroke","200m Backstroke"] },
  { group: "Breaststroke", events: ["50m Breaststroke","100m Breaststroke","200m Breaststroke"] },
  { group: "Butterfly",    events: ["50m Butterfly","100m Butterfly","200m Butterfly"] },
  { group: "Medley",       events: ["200m Individual Medley","400m Individual Medley"] },
];

// -- Swim England import widget ------------------------------------------------
function SwimEnglandImport({ onImport }) {
  const [tiref, setTiref]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [imported, setImported] = useState(null);

  const handleFetch = async () => {
    if (!tiref.trim()) return;
    setLoading(true); setError(null); setImported(null);
    try {
      const res = await fetch(`/api/swim-results?tiref=${encodeURIComponent(tiref.trim())}`);
      // Guard against HTML error pages (e.g. server crash returns <!DOCTYPE...)
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned an unexpected response. Check Heroku logs.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setImported(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const fieldStyle = {
    flex: 1, background: T.offWhite, border: `1px solid ${T.rule}`,
    padding: "11px 14px", fontSize: 13, color: T.dark,
    outline: "none", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <Label style={{ marginBottom: 8 }}>Import from Swim England</Label>
      <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 10 }}>
        Enter your son's British Swimming tiref number to auto-fill his personal bests from swimmingresults.org.
        Find it in his club membership details or on his Swim England profile.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          value={tiref}
          onChange={e => setTiref(e.target.value)}
          placeholder="e.g. 123456"
          style={fieldStyle}
        />
        <button
          onClick={handleFetch}
          disabled={loading || !tiref.trim()}
          style={{ background: loading ? T.rule : T.dark, color: T.white, border: "none", padding: "11px 16px", fontSize: 12, cursor: loading ? "default" : "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", opacity: !tiref.trim() ? 0.4 : 1 }}>
          {loading ? "..." : "Fetch"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, fontSize: 12, color: T.red, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {imported && (
        <div style={{ padding: "12px 14px", background: T.offWhite, borderLeft: `3px solid #007A5E` }}>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, fontWeight: 500, color: T.dark, marginBottom: 6 }}>
            {imported.name || "Swimmer"} -- {Object.keys(imported.times).length} times found
          </div>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.mid, marginBottom: 10 }}>
            {Object.entries(imported.times).slice(0, 4).map(([ev, t]) => `${ev}: ${t}`).join(" / ")}
            {Object.keys(imported.times).length > 4 ? " ..." : ""}
          </div>
          <button
            onClick={() => onImport(imported.times)}
            style={{ background: "#007A5E", color: T.white, border: "none", padding: "8px 16px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Use these times
          </button>
        </div>
      )}
    </div>
  );
}

export function ProfileSetup({ profile, pbs, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:     profile?.name     || "",
    age:      profile?.age      || "",
    gender:   profile?.gender   || "MALE",
    poolType: profile?.poolType || "LONG",
  });
  const [times, setTimes] = useState(pbs || {});
  const [page, setPage] = useState("profile"); // profile | pbs

  const age = parseInt(form.age, 10);
  const ag  = ageGroupKey(age);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setTime = (event, val) => setTimes(t => ({ ...t, [event]: val }));

  const profileValid = form.name.trim() && form.age >= 10 && form.age <= 25;

  const handleSave = () => {
    onSave({ profile: { ...form, age: parseInt(form.age, 10) }, pbs: times });
  };

  const fieldStyle = {
    width: "100%", background: T.offWhite, border: `1px solid ${T.rule}`,
    padding: "11px 14px", fontSize: 13, color: T.dark, boxSizing: "border-box",
    outline: "none", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
  };
  const radioRow = (label, val, field) => (
    <label key={val} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 8 }}>
      <input type="radio" name={field} value={val} checked={form[field] === val} onChange={() => set(field, val)}
        style={{ accentColor: T.red }} />
      <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark }}>{label}</span>
    </label>
  );

  if (page === "pbs") return (
    <div style={{ background: T.white, minHeight: "100vh" }}>
      <div style={{ padding: "32px 24px 20px" }}>
        {/* Back button always visible */}
        <button onClick={() => setPage("profile")} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Personal Bests</Label>
        <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 20 }}>
          {form.name}'s Times
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, margin: "12px 0 20px", lineHeight: 1.6 }}>
          Enter times as mm:ss.ss (e.g. 1:05.34) or ss.ss (e.g. 32.45). Leave blank if not swimming the event.
        </p>
      </div>

      {/* Swim England auto-import */}
      <div style={{ padding: "0 24px" }}>
        <SwimEnglandImport onImport={(importedTimes) => setTimes(t => ({ ...t, ...importedTimes }))} />
        <Rule style={{ marginBottom: 0 }} />
      </div>

      {STROKES_GROUPED.map(({ group, events }) => (
        <div key={group} style={{ marginBottom: 8 }}>
          <div style={{ padding: "10px 24px", background: T.offWhite }}>
            <Label>{group}</Label>
          </div>
          {events.map((event) => {
            const skip = EVENTS_NO_10_11.includes(event) && ag === "10/11";
            if (skip) return null;
            return (
              <div key={event} style={{ display: "flex", alignItems: "center", padding: "10px 24px", borderBottom: `1px solid ${T.rule}`, gap: 12 }}>
                <div style={{ flex: 1, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark }}>
                  {event}
                </div>
                <input
                  value={times[event] || ""}
                  onChange={e => setTime(event, e.target.value)}
                  placeholder="--"
                  style={{ ...fieldStyle, width: 90, textAlign: "right", padding: "7px 10px" }}
                />
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={handleSave}>Save Profile &amp; Times</Btn>
        <Btn onClick={() => setPage("profile")} variant="secondary">&larr; Back</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ background: T.white, minHeight: "100vh" }}>
      <div style={{ padding: "32px 24px 20px" }}>
        {/* Back/cancel always visible */}
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Home
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Athlete Profile</Label>
        <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 20 }}>
          {profile ? "Edit Profile" : "Set Up Profile"}
        </div>
        <Rule />
      </div>

      <div style={{ padding: "0 24px" }}>
        {/* Name */}
        <div style={{ marginBottom: 20 }}>
          <Label style={{ marginBottom: 8 }}>Swimmer name</Label>
          <input value={form.name} onChange={e => set("name", e.target.value)}
            placeholder="e.g. James" style={fieldStyle} />
        </div>

        {/* Age */}
        <div style={{ marginBottom: 20 }}>
          <Label style={{ marginBottom: 8 }}>Age at competition (2027)</Label>
          <input type="number" min={10} max={25} value={form.age} onChange={e => set("age", e.target.value)}
            placeholder="e.g. 13" style={{ ...fieldStyle, width: 100 }} />
          {form.age && <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginTop: 6 }}>Age group: {ag}</div>}
        </div>

        <Rule style={{ marginBottom: 20 }} />

        {/* Gender */}
        <div style={{ marginBottom: 20 }}>
          <Label style={{ marginBottom: 10 }}>Category</Label>
          {radioRow("Male / Open", "MALE", "gender")}
          {radioRow("Female", "FEMALE", "gender")}
        </div>

        <Rule style={{ marginBottom: 20 }} />

        {/* Pool type */}
        <div style={{ marginBottom: 24 }}>
          <Label style={{ marginBottom: 10 }}>Pool type</Label>
          {radioRow("Long course (50m)", "LONG", "poolType")}
          {radioRow("Short course (25m)", "SHORT", "poolType")}
        </div>

        <Btn
          onClick={() => setPage("pbs")}
          style={{ opacity: profileValid ? 1 : 0.4, pointerEvents: profileValid ? "auto" : "none" }}>
          Next -- Enter Personal Bests
        </Btn>
      </div>
      <div style={{ height: 32 }} />
    </div>
  );
}
