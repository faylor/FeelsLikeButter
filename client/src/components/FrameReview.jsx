import { useState, useMemo } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";

const SEND_MODES = [
  { key: "quick",    label: "Quick",    count: 8,  sub: "Fast, broad overview" },
  { key: "standard", label: "Standard", count: 20, sub: "Good balance" },
  { key: "deep",     label: "Deep",     count: 40, sub: "Most thorough" },
];

export function FrameReview({ frames, stroke, onConfirm, onBack }) {
  const [reviewed, setReviewed]   = useState(() => frames.map(f => ({ ...f })));
  const [sendMode, setSendMode]   = useState("standard");
  const [enlarged, setEnlarged]   = useState(null);

  const toggle = (i) => setReviewed(prev => prev.map((f, idx) => idx === i ? { ...f, approved: !f.approved } : f));

  const approved  = reviewed.filter(f => f.approved && f.data);
  const sendCount = SEND_MODES.find(m => m.key === sendMode)?.count || 20;

  // Evenly pick sendCount frames from the approved set
  const toSend = useMemo(() => {
    if (approved.length <= sendCount) return approved;
    const step = (approved.length - 1) / (sendCount - 1);
    return Array.from({ length: sendCount }, (_, i) => approved[Math.round(i * step)]);
  }, [reviewed, sendMode]);

  const trackedCount = reviewed.filter(f => f.tracked).length;

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 120 }}>

      {/* Header */}
      <div style={{ padding: "32px 24px 16px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 14px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Review Frames</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 8 }}>
          {stroke} Analysis
        </div>
        <Rule />

        {/* Stats */}
        <div style={{ display: "flex", gap: 20, marginTop: 14, marginBottom: 16 }}>
          {[[reviewed.length, "total"], [approved.length, "approved"], [trackedCount, "tracked"]].map(([n, l]) => (
            <div key={l}>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, color: T.dark, lineHeight: 1 }}>{n}</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Send count selector */}
        <Label style={{ marginBottom: 8 }}>Frames to send to AI</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
          {SEND_MODES.map(m => (
            <button key={m.key} onClick={() => setSendMode(m.key)} style={{
              padding: "10px 6px", border: `1px solid ${sendMode === m.key ? T.dark : T.rule}`,
              background: sendMode === m.key ? T.dark : "none",
              color: sendMode === m.key ? "#fff" : T.mid, cursor: "pointer", textAlign: "center",
              fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{m.label} ({m.count})</div>
              <div style={{ fontSize: 9, opacity: 0.75 }}>{m.sub}</div>
            </button>
          ))}
        </div>

        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, margin: 0 }}>
          Tap x to reject bad frames. Green border = swimmer tracked. Will evenly pick {toSend.length} from {approved.length} approved frames.
        </p>
      </div>

      {/* Frame grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, padding: "0 8px" }}>
        {reviewed.map((frame, i) => {
          if (!frame.data) return null;
          const inSendSet = toSend.includes(frame);
          return (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={`data:image/jpeg;base64,${frame.data}`}
                onClick={() => setEnlarged(i)}
                style={{
                  width: "100%", aspectRatio: "16/9", objectFit: "contain",
                  background: "#111", display: "block",
                  border: `2px solid ${!frame.approved ? T.red : inSendSet ? "#007A5E" : T.rule}`,
                  opacity: frame.approved ? 1 : 0.35,
                  cursor: "pointer",
                }}
                alt={`Frame ${i + 1}`}
              />
              <button onClick={() => toggle(i)} style={{
                position: "absolute", top: 3, right: 3, width: 20, height: 20,
                borderRadius: "50%", background: frame.approved ? "rgba(0,0,0,0.6)" : T.red,
                border: "none", color: "#fff", cursor: "pointer",
                fontSize: 11, lineHeight: "20px", textAlign: "center",
              }}>
                {frame.approved ? "x" : "+"}
              </button>
              {inSendSet && (
                <div style={{ position: "absolute", bottom: 3, left: 3, width: 6, height: 6, borderRadius: "50%", background: "#007A5E" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Enlarged modal */}
      {enlarged !== null && reviewed[enlarged]?.data && (
        <div onClick={() => setEnlarged(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <img src={`data:image/jpeg;base64,${reviewed[enlarged].data}`}
            style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain" }} />
          {reviewed[enlarged].angles?.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {reviewed[enlarged].angles.map((a, i) => (
                <span key={i} style={{ background: "#E63946", color: "#fff", padding: "3px 8px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, fontWeight: 500 }}>
                  {a.label} {a.deg}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
            <button onClick={e => { e.stopPropagation(); setEnlarged(i => Math.max(0, i - 1)); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>&larr;</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {enlarged + 1} / {reviewed.length} &nbsp;|&nbsp; {reviewed[enlarged].timestamp}s
              </div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em",
                color: reviewed[enlarged].tracked ? "#007A5E" : "rgba(255,255,255,0.35)" }}>
                {reviewed[enlarged].tracked ? "swimmer tracked" : "no tracking"}
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); setEnlarged(i => Math.min(reviewed.length - 1, i + 1)); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>&rarr;</button>
          </div>
          <button onClick={e => { e.stopPropagation(); toggle(enlarged); }}
            style={{ marginTop: 12, background: reviewed[enlarged].approved ? T.red : "#007A5E", border: "none", color: "#fff", padding: "8px 20px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {reviewed[enlarged].approved ? "Reject this frame" : "Approve this frame"}
          </button>
          <button onClick={() => setEnlarged(null)}
            style={{ marginTop: 8, background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.08em" }}>
            CLOSE
          </button>
        </div>
      )}

      {/* Action bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.rule}`, padding: "14px 24px" }}>
        {approved.length < 4 && (
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#C4610A", marginBottom: 8, textAlign: "center" }}>
            Approve at least 4 frames to continue
          </div>
        )}
        <Btn onClick={() => onConfirm(toSend)}
          style={{ opacity: approved.length >= 4 ? 1 : 0.4, pointerEvents: approved.length >= 4 ? "auto" : "none" }}>
          Analyse {toSend.length} frames
        </Btn>
      </div>
    </div>
  );
}
