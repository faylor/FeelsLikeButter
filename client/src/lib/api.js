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
