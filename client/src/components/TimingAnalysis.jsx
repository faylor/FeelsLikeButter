import { useState, useRef } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { EVENT_TURNS, EVENT_DISTANCE } from "../constants/competitionTimes.js";
import { parseTime, formatTime } from "../lib/timeUtils.js";
import { lapAwareTimestamps, extractFramesAtTimes, extractFrames } from "../lib/video.js";
import { analyzeSmartTiming } from "../lib/api.js";

const STROKE_EVENTS = {
  Freestyle:    ["50m Freestyle","100m Freestyle","200m Freestyle","400m Freestyle","800m Freestyle"],
  Backstroke:   ["50m Backstroke","100m Backstroke","200m Backstroke"],
  Breaststroke: ["50m Breaststroke","100m Breaststroke","200m Breaststroke"],
  Butterfly:    ["50m Butterfly","100m Butterfly","200m Butterfly"],
  Medley:       ["200m Individual Medley","400m Individual Medley"],
};

// --- Known-time split analysis via Claude ------------------------------------
async function analyseKnownTime(event, timeStr, poolType) {
  const dist  = EVENT_DISTANCE[event] || 0;
  const turns = EVENT_TURNS[event] || 0;
  const prompt = `You are an expert competitive swimming coach. Analyse this race time.

Event: ${event}
Time: ${timeStr}
Pool: ${poolType === "SHORT" ? "Short course (25m)" : "Long course (50m)"}
Distance: ${dist}m | Turns: ${turns}

Return ONLY valid JSON:
{
  "assessment": "<1 sentence on where this sits for a club swimmer>",
  "recommendedSplits": "<recommended pacing strategy with target split times>",
  "paceNote": "<1 sentence on ideal pacing strategy>",
  "turnImpact": "<how much time is in turns at club level and what can be gained>",
  "targetBreakdown": [{ "label": "<e.g. first 50m>", "target": "<time>", "note": "<coaching note>" }],
  "keyFocus": "<single most impactful improvement>"
}`;

  const res = await fetch("/api/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  const text = data.content?.map(b => b.text || "").join("") || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// --- Get video duration without extracting frames ----------------------------
function getVideoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.load();
  });
}

// --- Component ---------------------------------------------------------------
export function TimingAnalysis({ stroke: initialStroke, profile, pbs, onBack }) {
  const [stroke, setStroke] = useState(initialStroke || "Freestyle");
  const events   = STROKE_EVENTS[stroke] || STROKE_EVENTS.Freestyle;
  const poolType = profile?.poolType || "LONG";
  const poolLen  = poolType === "SHORT" ? 25 : 50;

  // Shared event selection
  const [event, setEvent] = useState(events[0]);

  // Section A: known time
  const [time, setTime]       = useState(pbs?.[events[0]] || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  // Section B: smart video timing
  const fileRef = useRef();
  const [videoFile, setVideoFile]   = useState(null);
  const [pbForVideo, setPbForVideo] = useState(pbs?.[events[0]] || "");
  const [vtLoading, setVtLoading]   = useState(false);
  const [vtProgress, setVtProgress] = useState(null);  // {done, total, phase}
  const [vtResult, setVtResult]     = useState(null);
  const [vtError, setVtError]       = useState(null);
  const [samplingPlan, setSamplingPlan] = useState(null); // preview of timestamps

  const dist  = EVENT_DISTANCE[event] || 0;
  const turns = EVENT_TURNS[event] || 0;
  const splits = dist > 0 ? dist / 50 : 0;
  const pbTime = pbs?.[event];
  const entSecs = parseTime(time);
  const pbVideoSecs = parseTime(pbForVideo);

  const handleEventChange = (e) => {
    setEvent(e);
    setTime(pbs?.[e] || "");
    setPbForVideo(pbs?.[e] || "");
    setResult(null); setError(null);
    setVtResult(null); setVtError(null);
    setSamplingPlan(null);
  };

  // Preview sampling plan when video + PB are both set
  const previewSampling = async (file, pbSecs) => {
    if (!file || !pbSecs) { setSamplingPlan(null); return; }
    const duration = await getVideoDuration(file);
    const timestamps = lapAwareTimestamps(duration, pbSecs, event, poolLen);
    const laps = dist / poolLen;
    const lapTime = (pbSecs / laps).toFixed(2);
    setSamplingPlan({ timestamps, duration, total: timestamps.length, lapTime, laps });
  };

  const handleVideoChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setVideoFile(f);
    setVtResult(null); setVtError(null);
    if (pbVideoSecs) await previewSampling(f, pbVideoSecs);
  };

  const handlePbVideoChange = async (val) => {
    setPbForVideo(val);
    const secs = parseTime(val);
    if (secs && videoFile) await previewSampling(videoFile, secs);
    else setSamplingPlan(null);
  };

  const handleSmartAnalysis = async () => {
    if (!videoFile) return;
    setVtLoading(true); setVtError(null); setVtResult(null);
    try {
      const duration = await getVideoDuration(videoFile);
      const timestamps = pbVideoSecs
        ? lapAwareTimestamps(duration, pbVideoSecs, event, poolLen)
        : Array.from({ length: 30 }, (_, i) => parseFloat(((duration / 31) * (i + 1)).toFixed(2)));

      setVtProgress({ done: 0, total: timestamps.length, phase: "extracting" });
      const frames = await extractFramesAtTimes(
        videoFile, timestamps, [], null,
        (done, total) => setVtProgress({ done, total, phase: "extracting" })
      );

      setVtProgress({ done: frames.length, total: frames.length, phase: "analysing" });
      const r = await analyzeSmartTiming(frames, event, poolLen, pbVideoSecs, stroke);
      setVtResult(r);
    } catch (e) { setVtError(e.message); }
    setVtLoading(false);
    setVtProgress(null);
  };

  const handleKnownTime = async () => {
    if (!time.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await analyseKnownTime(event, time.trim(), poolType);
      setResult(r);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const inputStyle = {
    background: T.offWhite, border: `1px solid ${T.rule}`,
    padding: "11px 14px", fontSize: 15, color: T.dark,
    outline: "none", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    letterSpacing: "0.04em",
  };

  const confidenceColor = (c) =>
    c === "high" ? "#007A5E" : c === "medium" ? "#C4610A" : T.red;
  const confidenceBg = (c) =>
    c === "high" ? "#EBF7F4" : c === "medium" ? "#FFF5EB" : "#FFF0F0";

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

        {/* Stroke selector */}
        <div style={{ display: "flex", borderBottom: `1px solid ${T.rule}`, marginBottom: 20 }}>
          {Object.keys(STROKE_EVENTS).map(s => (
            <button key={s} onClick={() => { setStroke(s); handleEventChange(STROKE_EVENTS[s][0]); }} style={{
              flex: 1, padding: "10px 4px", border: "none", background: "none", cursor: "pointer",
              fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
              fontSize: 9, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
              color: stroke === s ? T.dark : T.muted,
              borderBottom: `2px solid ${stroke === s ? T.dark : "transparent"}`,
              marginBottom: -1,
            }}>{s}</button>
          ))}
        </div>
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

        <Rule style={{ marginBottom: 24 }} />

        {/* ---- Section A: Analyse a known time ---- */}
        <div style={{ marginBottom: 32 }}>
          <Label style={{ color: T.dark, marginBottom: 4 }}>Analyse a known time</Label>
          <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
            Enter a race time to get split targets, pacing strategy, and turn impact.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input value={time} onChange={e => { setTime(e.target.value); setResult(null); }}
              placeholder={splits > 1 ? "m:ss.ss" : "ss.ss"} style={{ ...inputStyle, width: 120 }} />
            {pbTime && time !== pbTime && (
              <button onClick={() => { setTime(pbTime); setResult(null); }}
                style={{ background: "#EBF7F4", border: `1px solid #007A5E`, color: "#007A5E", padding: "7px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontWeight: 500 }}>
                Targets PB ({pbTime})
              </button>
            )}
            {pbTime && time === pbTime && (
              <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: "#007A5E", letterSpacing: "0.06em" }}>From Targets</span>
            )}
          </div>
          {entSecs && splits > 1 && (
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginBottom: 14 }}>
              Even split: {formatTime(entSecs / splits)} per 50m
              {turns > 0 && ` | ${turns} turn${turns > 1 ? "s" : ""}`}
            </div>
          )}
          {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, marginBottom: 14, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>{error}</div>}
          <Btn onClick={handleKnownTime} style={{ opacity: time.trim() ? 1 : 0.4, pointerEvents: time.trim() ? "auto" : "none" }}>
            {loading ? "Analysing..." : "Get Split Plan"}
          </Btn>

          {result && (
            <div style={{ marginTop: 20 }}>
              <div style={{ padding: "12px 16px", background: T.offWhite, borderLeft: `3px solid ${T.dark}`, marginBottom: 16 }}>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark, lineHeight: 1.6 }}>{result.assessment}</div>
              </div>
              {result.targetBreakdown?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <Label style={{ marginBottom: 12 }}>Target splits</Label>
                  {result.targetBreakdown.map((t, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${T.rule}` }}>
                      <div>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark }}>{t.label}</div>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>{t.note}</div>
                      </div>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, fontWeight: 300, color: T.dark }}>{t.target}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <Label style={{ marginBottom: 8 }}>Pacing strategy</Label>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark, lineHeight: 1.6, marginBottom: 6 }}>{result.recommendedSplits}</div>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.5 }}>{result.paceNote}</div>
              </div>
              {turns > 0 && result.turnImpact && (
                <div style={{ marginBottom: 16 }}>
                  <Label style={{ marginBottom: 8 }}>Turn impact ({turns} turn{turns > 1 ? "s" : ""})</Label>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark, lineHeight: 1.6 }}>{result.turnImpact}</div>
                </div>
              )}
              <div style={{ padding: "12px 16px", background: T.offWhite, borderLeft: `3px solid ${T.red}` }}>
                <Label style={{ color: T.red, marginBottom: 6 }}>Key focus</Label>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark, lineHeight: 1.5 }}>{result.keyFocus}</div>
              </div>
            </div>
          )}
        </div>

        <Rule style={{ marginBottom: 24 }} />

        {/* ---- Section B: Smart video timing ---- */}
        <div>
          <Label style={{ color: T.dark, marginBottom: 4 }}>Extract timing from video</Label>
          <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
            Frames are clustered around predicted wall-touch times based on your PB. Far fewer frames needed, much higher accuracy at each turn.
          </p>

          {/* PB for prediction */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <Label>PB for lap prediction</Label>
              {pbTime && pbForVideo === pbTime && (
                <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: "#007A5E", letterSpacing: "0.06em" }}>
                  From Targets profile
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input value={pbForVideo} onChange={e => handlePbVideoChange(e.target.value)}
                placeholder={splits > 1 ? "m:ss.ss" : "ss.ss"} style={{ ...inputStyle, width: 120 }} />
              {pbTime && pbForVideo !== pbTime && (
                <button onClick={() => handlePbVideoChange(pbTime)}
                  style={{ background: "#EBF7F4", border: `1px solid #007A5E`, color: "#007A5E", padding: "7px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontWeight: 500 }}>
                  Use Targets PB ({pbTime})
                </button>
              )}
              {!pbTime && !pbForVideo && (
                <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
                  No PB in Targets -- enter manually or add via Targets tab
                </span>
              )}
            </div>
          </div>

          {/* Video upload */}
          <div onClick={() => fileRef.current?.click()}
            style={{ border: `1px solid ${videoFile ? T.dark : T.rule}`, padding: "18px", cursor: "pointer", marginBottom: 12, background: videoFile ? T.offWhite : T.white, textAlign: "center" }}>
            <input ref={fileRef} type="file" accept="video/*" onChange={handleVideoChange} style={{ display: "none" }} />
            {videoFile
              ? <><div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark, marginBottom: 4 }}>Video selected</div><div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>{videoFile.name}</div></>
              : <><div style={{ fontSize: 20, color: T.muted, marginBottom: 6 }}>+</div><div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark }}>Select race video</div></>}
          </div>

          {/* Sampling plan preview */}
          {samplingPlan && (
            <div style={{ padding: "12px 14px", background: T.offWhite, border: `1px solid ${T.rule}`, marginBottom: 14 }}>
              <Label style={{ marginBottom: 8 }}>Smart sampling plan</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  ["Frames", samplingPlan.total],
                  ["Laps", samplingPlan.laps],
                  ["Predicted lap", `${samplingPlan.lapTime}s`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 9, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, fontWeight: 300, color: T.dark }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginTop: 8 }}>
                5 frames per wall zone, clustered within 1s of each predicted touch
              </div>
            </div>
          )}

          {!samplingPlan && videoFile && !pbVideoSecs && (
            <div style={{ padding: "10px 14px", background: "#FFF5EB", borderLeft: `3px solid #C4610A`, marginBottom: 12, fontSize: 12, color: "#C4610A", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
              Enter a recent PB above for smart sampling. Without it, 30 frames will be spread evenly.
            </div>
          )}

          {/* Progress */}
          {vtProgress && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.dark }}>
                  {vtProgress.phase === "extracting" ? "Extracting frames..." : "Analysing with AI..."}
                </div>
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
                  {vtProgress.phase === "extracting" ? `${vtProgress.done} / ${vtProgress.total}` : ""}
                </div>
              </div>
              <div style={{ height: 2, background: T.rule, borderRadius: 1, overflow: "hidden" }}>
                <div style={{ width: vtProgress.phase === "analysing" ? "100%" : `${Math.round(vtProgress.done / vtProgress.total * 100)}%`, height: "100%", background: T.dark, transition: "width 0.3s ease" }} />
              </div>
            </div>
          )}

          {vtError && <div style={{ padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, marginBottom: 14, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>{vtError}</div>}

          {videoFile && (
            <Btn onClick={handleSmartAnalysis} style={{ opacity: vtLoading ? 0.5 : 1, pointerEvents: vtLoading ? "none" : "auto" }}>
              {vtLoading ? "Analysing..." : "Extract Lap Times"}
            </Btn>
          )}

          {/* Results */}
          {vtResult && (
            <div style={{ marginTop: 24 }}>
              <Rule style={{ marginBottom: 20 }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Label>Race timing results</Label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {vtResult.pacingPattern && (
                    <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 8px", background: T.offWhite, color: T.dark }}>
                      {vtResult.pacingPattern.replace(/_/g, " ")}
                    </span>
                  )}
                  <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 8px", background: confidenceBg(vtResult.confidence), color: confidenceColor(vtResult.confidence) }}>
                    {vtResult.confidence} confidence
                  </span>
                </div>
              </div>

              {vtResult.pacingNote && (
                <div style={{ padding: "12px 16px", background: T.offWhite, borderLeft: `3px solid ${T.dark}`, marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.dark, lineHeight: 1.5 }}>{vtResult.pacingNote}</div>
                </div>
              )}

              {/* Lap times */}
              {vtResult.lapTimes?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <Label style={{ marginBottom: 12 }}>Lap times</Label>
                  {vtResult.lapTimes.map((lap, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.rule}` }}>
                      <div>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark }}>Lap {lap.lap}</div>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>{lap.note}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 18, fontWeight: 300, color: lap.detectedTouch ? T.dark : T.muted }}>
                          {lap.detectedTouch ? formatTime(lap.detectedTouch) : "?"}
                        </div>
                        <span style={{ fontSize: 9, color: confidenceColor(lap.confidence), textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
                          {lap.confidence}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Turn times */}
              {vtResult.turnTimes?.filter(t => t.duration != null).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <Label style={{ marginBottom: 12 }}>
                    Turn times
                    {vtResult.bestTurn && <span style={{ color: "#007A5E", marginLeft: 8 }}>Best: Turn {vtResult.bestTurn}</span>}
                    {vtResult.worstTurn && <span style={{ color: T.red, marginLeft: 8 }}>Slowest: Turn {vtResult.worstTurn}</span>}
                  </Label>
                  {vtResult.turnTimes.filter(t => t.duration != null).map((t, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.rule}` }}>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark }}>Turn {t.turn}</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 16, fontWeight: 300, color: t.turn === vtResult.bestTurn ? "#007A5E" : t.turn === vtResult.worstTurn ? T.red : T.dark }}>
                          {parseFloat(t.duration).toFixed(2)}s
                        </div>
                        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 9, color: confidenceColor(t.confidence), textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.confidence}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stroke data */}
              {(vtResult.strokeCount || vtResult.finishTime) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  {vtResult.finishTime && (
                    <div style={{ padding: "12px 14px", background: T.offWhite, border: `1px solid ${T.rule}` }}>
                      <Label style={{ marginBottom: 6 }}>Finish time</Label>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 20, fontWeight: 300, color: T.dark }}>{formatTime(vtResult.finishTime)}</div>
                    </div>
                  )}
                  {vtResult.strokeCount && (
                    <div style={{ padding: "12px 14px", background: T.offWhite, border: `1px solid ${T.rule}` }}>
                      <Label style={{ marginBottom: 6 }}>Stroke count</Label>
                      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 20, fontWeight: 300, color: T.dark }}>{vtResult.strokeCount}</div>
                    </div>
                  )}
                </div>
              )}

              {vtResult.dataQuality && (
                <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, fontStyle: "italic", lineHeight: 1.5 }}>
                  {vtResult.dataQuality}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
