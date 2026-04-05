import { useState, useRef } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { EVENT_TURNS, EVENT_DISTANCE } from "../constants/competitionTimes.js";
import { parseTime, formatTime } from "../lib/timeUtils.js";
import { extractFrames } from "../lib/video.js";
import { analyzeVideoTiming } from "../lib/api.js";

const STROKE_EVENTS = {
  Freestyle:    ["50m Freestyle","100m Freestyle","200m Freestyle","400m Freestyle","800m Freestyle"],
  Backstroke:   ["50m Backstroke","100m Backstroke","200m Backstroke"],
  Breaststroke: ["50m Breaststroke","100m Breaststroke","200m Breaststroke"],
  Butterfly:    ["50m Butterfly","100m Butterfly","200m Butterfly"],
  Medley:       ["200m Individual Medley","400m Individual Medley"],
};

// --- Known-time analysis via Claude ------------------------------------------
async function analyseTime(event, timeStr, poolType) {
  const dist   = EVENT_DISTANCE[event] || 0;
  const turns  = EVENT_TURNS[event] || 0;
  const prompt = `You are an expert competitive swimming coach. Analyse this race time and provide practical coaching advice.

Event: ${event}
Time: ${timeStr}
Pool: ${poolType === "SHORT" ? "Short course (25m)" : "Long course (50m)"}
Distance: ${dist}m
Turns: ${turns}

Return ONLY valid JSON, no surrounding text:
{
  "assessment": "<1 sentence on where this time sits competitively for a club swimmer>",
  "evenSplit": "<what each 50m split would be at perfectly even pace>",
  "recommendedSplits": "<recommended pacing strategy e.g. first half / second half split>",
  "paceNote": "<1 sentence on ideal pacing strategy for this event>",
  "turnImpact": "<how much total time is in turns at typical club level and what can be gained>",
  "targetBreakdown": [
    { "label": "<milestone e.g. first 50m>", "target": "<time>", "note": "<brief coaching note>" }
  ],
  "keyFocus": "<single most impactful thing to improve this time>"
}`;

  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  const text = data.content?.map(b => b.text || "").join("") || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// --- Main component ----------------------------------------------------------
export function TimingAnalysis({ stroke, profile, pbs, onBack }) {
  const events    = STROKE_EVENTS[stroke] || STROKE_EVENTS.Freestyle;
  const poolType  = profile?.poolType || "LONG";
  const poolLen   = poolType === "SHORT" ? 25 : 50;

  // Known-time state
  const [event, setEvent]     = useState(events[0]);
  const [time, setTime]       = useState(pbs?.[events[0]] || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  // Video timing state
  const fileRef = useRef();
  const [videoFile, setVideoFile]     = useState(null);
  const [vtLoading, setVtLoading]     = useState(false);
  const [vtProgress, setVtProgress]   = useState(null);
  const [vtResult, setVtResult]       = useState(null);
  const [vtError, setVtError]         = useState(null);

  // Derived
  const dist   = EVENT_DISTANCE[event] || 0;
  const turns  = EVENT_TURNS[event] || 0;
  const splits = dist > 0 ? dist / 50 : 0;
  const pbTime = pbs?.[event];
  const entSecs = parseTime(time);

  const handleEventChange = (e) => {
    setEvent(e);
    setTime(pbs?.[e] || "");
    setResult(null); setError(null);
  };

  const handleAnalyse = async () => {
    if (!time.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await analyseTime(event, time.trim(), poolType);
      setResult(r);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleVideoTiming = async () => {
    if (!videoFile) return;
    setVtLoading(true); setVtError(null); setVtResult(null); setVtProgress(null);
    try {
      const timedFrames = await extractFrames(
        videoFile, [], 40, null,
        (done, total) => setVtProgress({ done, total }),
        true
      );
      setVtProgress(null);
      const r = await analyzeVideoTiming(timedFrames, stroke, poolLen);
      setVtResult(r);
    } catch (e) { setVtError(e.message); }
    setVtLoading(false);
  };

  const inputStyle = {
    background: T.offWhite, border: `1px solid ${T.rule}`,
    padding: "11px 14px", fontSize: 16, color: T.dark,
    outline: "none", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    textAlign: "center", width: 130, letterSpacing: "0.05em",
  };

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ padding: "32px 24px 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Timing Analysis</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 20 }}>
          Splits &amp; Turns
        </div>
        <Rule />
      </div>

      <div style={{ padding: "0 24px" }}>

        {/* Event selector */}
        <div style={{ marginBottom: 20 }}>
          <Label style={{ marginBottom: 10 }}>Event</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {events.map(e => (
              <button key={e} onClick={() => handleEventChange(e)} style={{
                padding: "7px 14px", border: `1px solid ${event === e ? T.dark : T.rule}`,
                background: event === e ? T.dark : "none", color: event === e ? "#fff" : T.mid,
                fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
                cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
              }}>{e}</button>
            ))}
          </div>
        </div>

        <Rule style={{ marginBottom: 20 }} />

        {/* ---- Section A: Known time analysis ---- */}
        <Label style={{ marginBottom: 12 }}>Analyse a known time</Label>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input
              value={time}
              onChange={e => { setTime(e.target.value); setResult(null); }}
              placeholder={splits > 1 ? "m:ss.ss" : "ss.ss"}
              style={inputStyle}
            />
            {pbTime && time !== pbTime && (
              <button onClick={() => { setTime(pbTime); setResult(null); }}
                style={{ background: "none", border: `1px solid ${T.rule}`, color: T.mid, padding: "7px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.05em" }}>
                Use PB ({pbTime})
              </button>
            )}
          </div>
          {entSecs && splits > 1 && (
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
              Even-pace 50m split: {formatTime(entSecs / splits)}
              {turns > 0 && ` | ${turns} turn${turns > 1 ? "s" : ""}`}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, marginBottom: 14, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
            {error}
          </div>
        )}

        <Btn onClick={handleAnalyse} style={{ opacity: time.trim() ? 1 : 0.4, pointerEvents: time.trim() ? "auto" : "none", marginBottom: 24 }}>
          {loading ? "Analysing..." : "Analyse Splits and Turns"}
        </Btn>

        {/* Known time results */}
        {result && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ padding: "12px 16px", background: T.offWhite, borderLeft: `3px solid ${T.dark}`, marginBottom: 20 }}>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark, lineHeight: 1.6 }}>{result.assessment}</div>
            </div>

            {result.targetBreakdown?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Label style={{ marginBottom: 14 }}>Target splits</Label>
                {result.targetBreakdown.map((t, i) => (
                  <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < result.targetBreakdown.length - 1 ? `1px solid ${T.rule}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark }}>{t.label}</div>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, fontWeight: 300, color: T.dark }}>{t.target}</div>
                    </div>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.mid, lineHeight: 1.5 }}>{t.note}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <Label style={{ marginBottom: 10 }}>Recommended pacing</Label>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark, lineHeight: 1.6, marginBottom: 8 }}>{result.recommendedSplits}</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.5 }}>{result.paceNote}</div>
            </div>

            {turns > 0 && result.turnImpact && (
              <div style={{ marginBottom: 20 }}>
                <Label style={{ marginBottom: 10 }}>Turn analysis ({turns} turn{turns > 1 ? "s" : ""})</Label>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark, lineHeight: 1.6 }}>{result.turnImpact}</div>
              </div>
            )}

            <div style={{ padding: "12px 16px", background: T.offWhite, borderLeft: `3px solid ${T.red}` }}>
              <Label style={{ color: T.red, marginBottom: 6 }}>Key focus</Label>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark, lineHeight: 1.5 }}>{result.keyFocus}</div>
            </div>
          </div>
        )}

        <Rule style={{ marginBottom: 20 }} />

        {/* ---- Section B: Video timing extraction ---- */}
        <Label style={{ marginBottom: 6 }}>Extract timing from video</Label>
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 14 }}>
          Upload a video and Claude identifies wall touches, turn times, stroke count, and splits directly from the footage. Accuracy ~0.2s.
        </p>

        <div onClick={() => fileRef.current?.click()}
          style={{ border: `1px solid ${videoFile ? T.dark : T.rule}`, padding: "20px", cursor: "pointer", marginBottom: 14, background: videoFile ? T.offWhite : T.white, textAlign: "center" }}>
          <input ref={fileRef} type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setVideoFile(f); setVtResult(null); } }} style={{ display: "none" }} />
          {videoFile
            ? <><div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark, marginBottom: 4 }}>Video selected</div><div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>{videoFile.name}</div></>
            : <><div style={{ fontSize: 20, color: T.muted, marginBottom: 6 }}>+</div><div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark }}>Select video</div></>}
        </div>

        {vtProgress && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 2, background: T.rule, borderRadius: 1, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${Math.round(vtProgress.done / vtProgress.total * 100)}%`, height: "100%", background: T.dark, transition: "width 0.2s ease" }} />
            </div>
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
              Extracting {vtProgress.done} / {vtProgress.total} frames...
            </div>
          </div>
        )}

        {vtError && (
          <div style={{ padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, marginBottom: 14, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
            {vtError}
          </div>
        )}

        {videoFile && (
          <Btn onClick={handleVideoTiming} style={{ opacity: vtLoading ? 0.5 : 1, pointerEvents: vtLoading ? "none" : "auto" }}>
            {vtLoading && !vtProgress ? "Analysing video..." : "Extract Timing from Video"}
          </Btn>
        )}

        {/* Video timing results */}
        {vtResult && (
          <div style={{ marginTop: 24 }}>
            <Rule style={{ marginBottom: 20 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Label>Video timing results</Label>
              <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 10px", background: vtResult.confidence === "high" ? "#EBF7F4" : vtResult.confidence === "medium" ? "#FFF5EB" : "#FFF0F0", color: vtResult.confidence === "high" ? "#007A5E" : vtResult.confidence === "medium" ? "#C4610A" : T.red }}>
                {vtResult.confidence} confidence
              </span>
            </div>

            {/* Calculated times grid */}
            {vtResult.calculatedTimes && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {vtResult.calculatedTimes.turnTime != null && (
                  <div style={{ padding: "12px 14px", background: T.offWhite, border: `1px solid ${T.rule}` }}>
                    <Label style={{ marginBottom: 6 }}>Turn time</Label>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, color: T.dark }}>
                      {parseFloat(vtResult.calculatedTimes.turnTime).toFixed(2)}s
                    </div>
                  </div>
                )}
                {vtResult.calculatedTimes.totalVisibleTime != null && (
                  <div style={{ padding: "12px 14px", background: T.offWhite, border: `1px solid ${T.rule}` }}>
                    <Label style={{ marginBottom: 6 }}>Visible time</Label>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, color: T.dark }}>
                      {formatTime(vtResult.calculatedTimes.totalVisibleTime)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Split times */}
            {vtResult.calculatedTimes?.splitTimes?.filter(Boolean).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Label style={{ marginBottom: 10 }}>Split times</Label>
                {vtResult.calculatedTimes.splitTimes.filter(Boolean).map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.rule}` }}>
                    <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid }}>{poolLen * (i + 1)}m split</span>
                    <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 14, fontWeight: 300, color: T.dark }}>
                      {typeof t === "number" ? formatTime(t) : t}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Stroke data */}
            {(vtResult.strokeCount || vtResult.strokeRateCyclesPerSec) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {vtResult.strokeCount && (
                  <div style={{ padding: "12px 14px", background: T.offWhite, border: `1px solid ${T.rule}` }}>
                    <Label style={{ marginBottom: 6 }}>Stroke count</Label>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, color: T.dark }}>{vtResult.strokeCount}</div>
                  </div>
                )}
                {vtResult.strokeRateCyclesPerSec && (
                  <div style={{ padding: "12px 14px", background: T.offWhite, border: `1px solid ${T.rule}` }}>
                    <Label style={{ marginBottom: 6 }}>Stroke rate</Label>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, fontWeight: 300, color: T.dark }}>{vtResult.strokeRateCyclesPerSec}</div>
                  </div>
                )}
              </div>
            )}

            {/* Event timeline */}
            {vtResult.events?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Label style={{ marginBottom: 10 }}>Detected events</Label>
                {vtResult.events.map((ev, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, fontWeight: 300, color: T.dark, width: 48, flexShrink: 0 }}>{ev.timestamp}s</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark, textTransform: "capitalize" }}>{ev.event.replace(/_/g, " ")}</div>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>{ev.note}</div>
                    </div>
                    <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 9, color: ev.confidence === "high" ? "#007A5E" : T.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{ev.confidence}</span>
                  </div>
                ))}
              </div>
            )}

            {vtResult.notes && (
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, fontStyle: "italic", lineHeight: 1.5 }}>
                {vtResult.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
