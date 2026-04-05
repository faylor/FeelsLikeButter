import { useState, useEffect } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { extractPreviewFrames } from "../lib/video.js";

export function VideoPreview({ videoFile, crop, onConfirm, onBack }) {
  const [frames, setFrames]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [confirmed, setConfirmed] = useState({}); // {idx: true/false}
  const [enlarged, setEnlarged] = useState(null);

  useEffect(() => {
    if (!videoFile) return;
    setLoading(true); setError(null);
    extractPreviewFrames(videoFile)
      .then(f => { setFrames(f); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [videoFile]);

  const toggle = (i) => setConfirmed(prev => ({ ...prev, [i]: !prev[i] }));

  // Default: all confirmed. User taps to mark bad frames.
  const goodCount = frames.filter((_, i) => confirmed[i] !== false).length;
  const anyConfirmed = goodCount > 0;

  // Pass back the timestamps of confirmed frames so extraction focuses there
  const handleContinue = () => {
    const goodTimes = frames
      .filter((_, i) => confirmed[i] !== false)
      .map(f => f.time);
    onConfirm(goodTimes);
  };

  if (loading) {
    return (
      <div style={{ padding: "80px 24px", textAlign: "center" }}>
        <div style={{ width: 32, height: 1, background: T.dark, margin: "0 auto 32px" }} />
        <Label style={{ display: "block", color: T.black }}>Checking video...</Label>
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, marginTop: 12 }}>
          Loading 5 preview frames
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 100 }}>
      <div style={{ padding: "32px 24px 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 14px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Step 2 of 4</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 8 }}>
          Confirm Swimmer
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, margin: "14px 0 0" }}>
          These 5 frames are spread across your video. Tap any frame where the swimmer is <strong>not visible</strong> to mark it as bad. Tap again to restore. Then tap Continue to process the full video.
        </p>
      </div>

      {error && (
        <div style={{ margin: "0 24px 16px", padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
          {error}
        </div>
      )}

      {/* Frame grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px" }}>
        {frames.map((f, i) => {
          const isBad = confirmed[i] === false;
          return (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={`data:image/jpeg;base64,${f.data}`}
                onClick={() => setEnlarged(i)}
                style={{
                  width: "100%", aspectRatio: "16/9",
                  objectFit: "cover", display: "block",
                  border: `3px solid ${isBad ? T.red : "#007A5E"}`,
                  opacity: isBad ? 0.4 : 1,
                  cursor: "pointer",
                }}
                alt={`Preview ${i + 1}`}
              />
              {/* Bad/Good toggle */}
              <button onClick={() => toggle(i)} style={{
                position: "absolute", top: 6, right: 6,
                background: isBad ? T.red : "#007A5E",
                border: "none", color: "#fff", cursor: "pointer",
                padding: "4px 10px", fontSize: 11,
                fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
                letterSpacing: "0.04em",
              }}>
                {isBad ? "Bad" : "Good"}
              </button>
              {/* Timestamp */}
              <div style={{
                position: "absolute", bottom: 6, left: 6,
                background: "rgba(0,0,0,0.6)", color: "#fff",
                padding: "2px 6px", fontSize: 10,
                fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
              }}>
                {f.time.toFixed(1)}s
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {frames.length > 0 && (
        <div style={{ margin: "16px 24px 0", padding: "12px 14px", background: T.offWhite }}>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.6 }}>
            {goodCount} of {frames.length} frames confirmed.
            {goodCount < frames.length && ` ${frames.length - goodCount} marked as bad -- those sections will still be extracted but without tracked crop.`}
          </div>
        </div>
      )}

      {/* Enlarged modal */}
      {enlarged !== null && frames[enlarged] && (
        <div onClick={() => setEnlarged(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <img src={`data:image/jpeg;base64,${frames[enlarged].data}`}
            style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 12 }}>
            {frames[enlarged].time.toFixed(1)}s into video
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button onClick={e => { e.stopPropagation(); setEnlarged(i => Math.max(0, i - 1)); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>&larr;</button>
            <button onClick={e => { e.stopPropagation(); toggle(enlarged); }}
              style={{ background: confirmed[enlarged] === false ? "#007A5E" : T.red, border: "none", color: "#fff", padding: "8px 18px", fontSize: 12, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.06em" }}>
              Mark as {confirmed[enlarged] === false ? "Good" : "Bad"}
            </button>
            <button onClick={e => { e.stopPropagation(); setEnlarged(i => Math.min(frames.length - 1, i + 1)); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>&rarr;</button>
          </div>
          <button onClick={() => setEnlarged(null)}
            style={{ marginTop: 10, background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.08em" }}>
            CLOSE
          </button>
        </div>
      )}

      {/* Action bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.rule}`, padding: "14px 24px" }}>
        <Btn onClick={handleContinue} style={{ opacity: anyConfirmed ? 1 : 0.4, pointerEvents: anyConfirmed ? "auto" : "none" }}>
          Continue -- Process full video
        </Btn>
      </div>
    </div>
  );
}
