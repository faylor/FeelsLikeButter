// Calls our Express proxy at /api/messages -- API key stays server-side
export async function analyzeWithClaude(frames, stroke, checklist) {
  const prompt = `You are an expert competitive swimming coach assessing a club-level swimmer's ${stroke} technique from poolside footage. Faces may be obscured for privacy -- focus on body mechanics only.

Scoring scale -- use the FULL range, be discriminating:
- 85-100: Textbook technique, competition-ready
- 70-84: Good with minor correctable flaws
- 50-69: Noticeable flaw that costs time, needs focused work
- 30-49: Significant technical problem, priority fix
- 0-29: Fundamental error, major time loss

Score each item independently against club/county competitive standards.
Do NOT cluster scores around 50 -- if something is genuinely good, score it 80+. If genuinely poor, score it 30-.

Analyze these ${frames.length} frames for each checklist item:
${checklist.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Return ONLY a valid JSON object with no surrounding text, no markdown, no code fences:
{"overallScore":<0-100>,"summary":"<2-3 sentences including standout strength and main weakness>","items":[{"name":"<item>","score":<0-100>,"status":"<good|warning|needs_work>","feedback":"<1 specific sentence with observable detail>","drill":"<1 drill>"}],"topPriority":"<most important fix>","competitionNote":"<1 sentence on race time impact>"}`;

  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          ...frames.map((b64) => ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: b64 },
          })),
          { type: "text", text: prompt },
        ],
      }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);

  const text = data.content?.map((b) => b.text || "").join("") || "";
  console.log("[swim] raw response:", text.slice(0, 200));

  // Extract JSON object robustly -- works even if Claude adds surrounding text
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response. Got: ${text.slice(0, 100)}`);

  const result = JSON.parse(match[0]);
  console.log("[swim] overallScore:", result.overallScore);
  return result;
}

// --- Analyse video for actual timing data ------------------------------------
// frames: [{data: base64, time: seconds}] -- timestamps are included
// Returns split times, turn times, stroke count from the video itself
export async function analyzeVideoTiming(timedFrames, stroke, poolLength) {
  const frameList = timedFrames.map((f, i) =>
    `Frame ${i + 1} at ${f.time}s`
  ).join(", ");

  const prompt = `You are an expert swimming timing analyst. You have ${timedFrames.length} frames from a ${stroke} video in a ${poolLength}m pool, captured at known timestamps.

Frame timestamps: ${frameList}

The frames are shown below in order, each labeled with its timestamp.

Analyze these frames to identify timing events. Look for:
- Wall touches (swimmer's hand/feet touching the wall at turns or finish)
- Wall push-offs / breakouts (swimmer leaving the wall)
- Stroke cycles to count strokes
- Any visible timing boards, scorecards, or lane markers

Return ONLY valid JSON, no surrounding text:
{
  "events": [
    { "event": "start|wall_touch|wall_leave|finish", "timestamp": <seconds>, "confidence": "high|medium|low", "note": "<what you see>" }
  ],
  "strokeCount": <number or null if unclear>,
  "strokeRateCyclesPerSec": <number or null>,
  "visibleLengths": <how many pool lengths are visible>,
  "calculatedTimes": {
    "turnTime": <wall_leave.time - wall_touch.time, or null>,
    "splitTimes": [<time for each visible 50m, or null>],
    "totalVisibleTime": <finish.time - start.time, or null>
  },
  "confidence": "high|medium|low",
  "notes": "<any caveats about what was or was not clearly visible>"
}`;

  // Build interleaved content: text label + image for each frame
  const content = [];
  timedFrames.forEach((f, i) => {
    content.push({ type: "text", text: `Frame ${i + 1} at ${f.time}s:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  });
  content.push({ type: "text", text: prompt });

  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);

  const text = data.content?.map(b => b.text || "").join("") || "";
  console.log("[video-timing] raw:", text.slice(0, 200));
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// --- Smart lap-aware timing analysis -----------------------------------------
// frames: [{data, time, zone}] with zone labels from lapAwareTimestamps
export async function analyzeSmartTiming(frames, event, poolLength, recentPbSecs, stroke) {
  const dist  = parseInt(event) || 100;
  const laps  = dist / poolLength;
  const lapPb = recentPbSecs ? (recentPbSecs / laps).toFixed(2) : "unknown";

  // Group frames by zone for Claude context
  const startFrames  = frames.filter(f => f.zone === "start");
  const wallFrames   = frames.filter(f => f.zone === "wall-zone");
  const finishFrames = frames.filter(f => f.zone === "finish");

  const frameList = frames.map((f, i) =>
    `Frame ${i + 1} [${f.zone}] at ${f.time}s`
  ).join(", ");

  const prompt = `You are an expert swimming timing analyst. Analyze these ${frames.length} frames from a ${event} race in a ${poolLength}m pool.

Recent PB for this event: ${recentPbSecs ? recentPbSecs + "s" : "unknown"}
Expected lap time: ~${lapPb}s per ${poolLength}m lap
Number of laps: ${laps}
Stroke: ${stroke}

Frames are clustered at predicted wall-touch zones (${wallFrames.length} wall frames), plus start (${startFrames.length} frames) and finish (${finishFrames.length} frames).
Frame timestamps: ${frameList}

For each wall zone cluster, identify the exact wall-touch moment by looking for:
- Hand/feet contact with wall
- Body direction change (approaching vs leaving wall)
- Streamline position after push-off
- Splash patterns at wall

Return ONLY valid JSON:
{
  "lapTimes": [
    { "lap": 1, "predictedEnd": <seconds>, "detectedTouch": <seconds or null>, "confidence": "high|medium|low", "note": "<what you saw>" }
  ],
  "turnTimes": [
    { "turn": 1, "touchTime": <seconds>, "leaveTime": <seconds>, "duration": <seconds>, "confidence": "high|medium|low" }
  ],
  "splits": [
    { "label": "Lap 1", "time": <seconds or null>, "pace": "<faster/slower/even vs predicted>" }
  ],
  "finishTime": <seconds or null>,
  "strokeCount": <total visible strokes or null>,
  "pacingPattern": "<even|positive split|negative split|variable>",
  "pacingNote": "<1 sentence on observed pacing>",
  "bestTurn": <turn number or null>,
  "worstTurn": <turn number or null>,
  "confidence": "high|medium|low",
  "dataQuality": "<any issues with frame coverage>"
}`;

  // Build content: labeled image + timestamp for each frame
  const content = [];
  frames.forEach((f, i) => {
    content.push({ type: "text", text: `Frame ${i + 1} [${f.zone}] at ${f.time}s:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  });
  content.push({ type: "text", text: prompt });

  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  const text = data.content?.map(b => b.text || "").join("") || "";
  console.log("[smart-timing] raw:", text.slice(0, 200));
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}
