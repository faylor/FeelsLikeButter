import { useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";

export function FrameReview({ frames, stroke, onConfirm, onBack }) {
  const [reviewed, setReviewed] = useState(
    () => frames.map(f => ({ ...f }))
  );
  const [enlarged, setEnlarged] = useState(null);

  const toggle = (i) => {
    setReviewed(prev => prev.map((f, idx) =>
      idx === i ? { ...f, approved: !f.approved } : f
    ));
  };

  const approvedCount = reviewed.filter(f => f.approved && f.data).length;
  const trackedCount  = reviewed.filter(f => f.tracked).length;

  const handleConfirm = () => {
    const approved = reviewed.filter(f => f.approved && f.data);
    onConfirm(approved);
  };

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 100 }}>

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

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, marginBottom: 4 }}>
          {[
            [approvedCount, "approved"],
            [reviewed.length - approvedCount, "rejected"],
            [trackedCount, "tracked"],
          ].map(([n, label]) => (
            <div key={label}>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, color: T.dark, lineHeight: 1 }}>{n}</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div style={{ padding: "0 24px 16px" }}>
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, margin: 0 }}>
          Tap any frame to enlarge. Tap the reject button to exclude bad frames -- underwater, wrong swimmer, blurred. Green border = tracked. Only approved frames go to the AI.
        </p>
      </div>

      {/* Frame grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: "0 12px" }}>
        {reviewed.map((frame, i) => {
          if (!frame.data) return null;
          const isApproved = frame.approved;
          return (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={`data:image/jpeg;base64,${frame.data}`}
                onClick={() => setEnlarged(i)}
                style={{
                  width: "100%", aspectRatio: "16/9",
                  objectFit: "cover", display: "block",
                  border: `2px solid ${isApproved ? (frame.tracked ? "#007A5E" : T.rule) : T.red}`,
                  opacity: isApproved ? 1 : 0.4,
                  cursor: "pointer",
                }}
                alt={`Frame ${i + 1}`}
              />
              {/* Reject toggle */}
              <button
                onClick={() => toggle(i)}
                style={{
                  position: "absolute", top: 4, right: 4,
                  width: 22, height: 22, borderRadius: "50%",
                  background: isApproved ? "rgba(0,0,0,0.55)" : T.red,
                  border: "none", color: "#fff", cursor: "pointer",
                  fontSize: 12, lineHeight: "22px", textAlign: "center",
                  fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
                }}>
                {isApproved ? "x" : "+"}
              </button>
              {/* Frame number */}
              <div style={{
                position: "absolute", bottom: 4, left: 4,
                fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
                fontSize: 9, color: "rgba(255,255,255,0.8)",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              }}>
                #{frame.frameIndex + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Enlarged modal */}
      {enlarged !== null && reviewed[enlarged]?.data && (
        <div
          onClick={() => setEnlarged(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <img
            src={`data:image/jpeg;base64,${reviewed[enlarged].data}`}
            style={{ maxWidth: "100%", maxHeight: "68vh", objectFit: "contain" }}
            alt={`Frame ${enlarged + 1}`}
          />

          {/* Angles summary */}
          {reviewed[enlarged].angles?.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {reviewed[enlarged].angles.map((a, i) => (
                <span key={i} style={{ background: "#E63946", color: "#fff", padding: "3px 8px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, fontWeight: 500 }}>
                  {a.label} {a.deg}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 14 }}>
            <button
              onClick={e => { e.stopPropagation(); setEnlarged(i => Math.max(0, i - 1)); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>
              &larr;
            </button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Frame {enlarged + 1} of {reviewed.length} &nbsp;|&nbsp; {reviewed[enlarged].timestamp}s
              </div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: reviewed[enlarged].tracked ? "#007A5E" : "rgba(255,255,255,0.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {reviewed[enlarged].tracked ? "Swimmer tracked" : "No tracking"}
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setEnlarged(i => Math.min(reviewed.length - 1, i + 1)); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>
              &rarr;
            </button>
          </div>

          <button
            onClick={e => { e.stopPropagation(); toggle(enlarged); }}
            style={{ marginTop: 12, background: reviewed[enlarged].approved ? T.red : "#007A5E", border: "none", color: "#fff", padding: "8px 20px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {reviewed[enlarged].approved ? "Reject this frame" : "Approve this frame"}
          </button>

          <button onClick={() => setEnlarged(null)}
            style={{ marginTop: 8, background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.08em" }}>
            CLOSE
          </button>
        </div>
      )}

      {/* Bottom action bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.rule}`, padding: "14px 24px" }}>
        {approvedCount < 4 && (
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#C4610A", marginBottom: 10, textAlign: "center" }}>
            Approve at least 4 frames to analyse
          </div>
        )}
        <Btn
          onClick={handleConfirm}
          style={{ opacity: approvedCount >= 4 ? 1 : 0.4, pointerEvents: approvedCount >= 4 ? "auto" : "none" }}>
          Analyse {approvedCount} Approved Frames
        </Btn>
      </div>
    </div>
  );
}
