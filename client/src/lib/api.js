// Calls our Express proxy at /api/messages — API key stays server-side
export async function analyzeWithClaude(frames, stroke, checklist) {
  const prompt = `You are an expert competitive swimming coach analyzing a club-level swimmer's ${stroke} technique from poolside footage. Faces may be obscured for privacy — focus on body mechanics only.

Analyze these ${frames.length} frames for each checklist item:
${checklist.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Return ONLY valid JSON:
{"overallScore":<0-100>,"summary":"<2-3 sentences>","items":[{"name":"<item>","score":<0-100>,"status":"<good|warning|needs_work>","feedback":"<1 sentence>","drill":"<1 drill>"}],"topPriority":"<most important fix>","competitionNote":"<1 sentence>"}`;

  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
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
  if (!res.ok) throw new Error(data.error || "API error");

  const text = data.content?.map((b) => b.text || "").join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}
