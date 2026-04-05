import { useState, useEffect, useRef } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { extractPreviewFrames } from "../lib/video.js";

const BOX_COLORS = ["#E63946", "#2196F3", "#FF9800", "#9C27B0"];

// --- Step 2: Draw lane ropes -------------------------------------------------
function LaneRopeStep({ frame, onConfirm, onBack }) {
  const canvasRef  = useRef();
  const [lines, setLines]     = useState({ upper: null, lower: null });
  const [drawing, setDrawing] = useState(null); // "upper" | "lower" | null
  const [startPt, setStartPt] = useState(null);
  const [liveEnd, setLiveEnd] = useState(null);

  const CW = 640, CH = 360;

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, CW, CH);
      ctx.drawImage(img, 0, 0, CW, CH);

      // Draw confirmed lines
      const drawLine = (line, color, label) => {
        if (!line) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(line.x1 * CW, line.y1 * CH);
        ctx.lineTo(line.x2 * CW, line.y2 * CH);
        ctx.stroke();
        // Label
        ctx.fillStyle = color;
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(label, line.x1 * CW + 6, line.y1 * CH - 6);
      };
      drawLine(lines.upper, "#FFD600", "Upper lane rope");
      drawLine(lines.lower, "#00E5FF", "Lower lane rope");

      // Draw live preview line while dragging
      if (drawing && startPt && liveEnd) {
        const col = drawing === "upper" ? "#FFD600" : "#00E5FF";
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(startPt.x, startPt.y);
        ctx.lineTo(liveEnd.x, liveEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Hint if no lines yet
      if (!lines.upper && !lines.lower && !drawing) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, CH/2 - 18, CW, 36);
        ctx.fillStyle = "#fff";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Draw upper lane rope first (yellow button below)", CW/2, CH/2 + 5);
        ctx.textAlign = "left";
      }
    };
    img.src = `data:image/jpeg;base64,${frame.data}`;
  }, [frame, lines, drawing, startPt, liveEnd]);

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const sx = CW / r.width, sy = CH / r.height;
    const touch = e.touches?.[0] ?? e.changedTouches?.[0];
    const cx = touch ? touch.clientX : e.clientX;
    const cy = touch ? touch.clientY : e.clientY;
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  };

  const onDown = (e) => {
    if (!drawing) return;
    e.preventDefault();
    setStartPt(getPos(e));
    setLiveEnd(null);
  };

  const onMove = (e) => {
    if (!drawing || !startPt) return;
    e.preventDefault();
    setLiveEnd(getPos(e));
  };

  const onUp = (e) => {
    if (!drawing || !startPt) return;
    const end = getPos(e);
    const dist = Math.hypot(end.x - startPt.x, end.y - startPt.y);
    if (dist > 20) {
      setLines(prev => ({
        ...prev,
        [drawing]: {
          x1: startPt.x / CW, y1: startPt.y / CH,
          x2: end.x / CW,     y2: end.y / CH,
        },
      }));
    }
    setDrawing(null); setStartPt(null); setLiveEnd(null);
  };

  const ropeLineStyle = (which, col) => ({
    padding: "10px 16px", border: `2px solid ${drawing === which ? col : T.rule}`,
    background: drawing === which ? col : lines[which] ? col + "22" : "none",
    color: drawing === which ? "#111" : lines[which] ? col : T.mid,
    cursor: "pointer", fontSize: 12, fontWeight: 500,
    fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    letterSpacing: "0.04em", flex: 1,
  });

  const bothDrawn   = lines.upper && lines.lower;
  const eitherDrawn = lines.upper || lines.lower;

  const handleConfirm = () => onConfirm({ laneRopes: lines });

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 160 }}>
      <div style={{ padding: "24px 24px 16px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 12px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 4 }}>Lane Ropes (optional)</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 20, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 8 }}>
          Mark Lane Boundaries
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, margin: "12px 0 14px" }}>
          Draw the upper and lower lane ropes of your swimmer's lane. This helps the tracker understand pool perspective and keeps the crop bounded to the correct lane.
        </p>
      </div>

      {/* Canvas */}
      <div style={{ margin: "0 16px 12px", position: "relative" }}>
        <canvas ref={canvasRef} width={CW} height={CH}
          style={{ width: "100%", display: "block", cursor: drawing ? "crosshair" : "default", touchAction: "none", border: `1px solid ${T.rule}` }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
      </div>

      {/* Draw buttons */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 10 }}>
        <button onClick={() => setDrawing(d => d === "upper" ? null : "upper")} style={ropeLineStyle("upper", "#FFD600")}>
          {lines.upper ? "Redraw upper" : drawing === "upper" ? "Drawing..." : "Draw upper rope"}
        </button>
        <button onClick={() => setDrawing(d => d === "lower" ? null : "lower")} style={ropeLineStyle("lower", "#00E5FF")}>
          {lines.lower ? "Redraw lower" : drawing === "lower" ? "Drawing..." : "Draw lower rope"}
        </button>
      </div>

      {(lines.upper || lines.lower) && (
        <div style={{ margin: "0 16px 12px", padding: "10px 14px", background: T.offWhite, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, lineHeight: 1.6 }}>
          {lines.upper && <div style={{ color: "#B8A000" }}>Upper rope drawn</div>}
          {lines.lower && <div style={{ color: "#008FA8" }}>Lower rope drawn</div>}
          {!bothDrawn && <div style={{ marginTop: 4, color: T.muted, fontSize: 11 }}>Draw both ropes for best tracking accuracy. You can skip if ropes are not visible.</div>}
        </div>
      )}

      {/* Actions */}
      <div style={{ position: "fixed", bottom: 72, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.rule}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn onClick={handleConfirm}>
          {eitherDrawn ? "Confirm Lane Ropes -- Start Processing" : "Skip -- Process Without Lane Ropes"}
        </Btn>
      </div>
    </div>
  );
}

// --- Step 1: Confirm swimmer -------------------------------------------------
export function VideoPreview({ videoFile, crop, onConfirm, onBack }) {
  const [frames, setFrames]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [selected, setSelected] = useState(null); // {frameIdx, poseIdx}
  const [enlarged, setEnlarged] = useState(null);
  const [page, setPage]         = useState("swimmer"); // "swimmer" | "ropes"

  useEffect(() => {
    if (!videoFile) return;
    setLoading(true); setError(null); setSelected(null); setPage("swimmer");
    extractPreviewFrames(videoFile)
      .then(f => {
        setFrames(f);
        setLoading(false);
        const all = f.flatMap((frame, fi) => frame.poses.map(p => ({ fi, pi: p.idx })));
        if (all.length === 1) setSelected({ frameIdx: all[0].fi, poseIdx: all[0].pi });
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [videoFile]);

  const handleSelect = (fi, pi) =>
    setSelected(prev => prev?.frameIdx === fi && prev?.poseIdx === pi ? null : { frameIdx: fi, poseIdx: pi });

  const handleSwimmerConfirm = () => setPage("ropes");

  const handleRopesConfirm = ({ laneRopes }) => {
    const frame = selected ? frames[selected.frameIdx] : null;
    const pose  = frame?.poses.find(p => p.idx === selected?.poseIdx);
    onConfirm({
      landmarks: pose?.landmarks || null,
      bb:        pose?.bb || null,
      time:      frame?.time,
      laneRopes, // { upper: {x1,y1,x2,y2}, lower: {x1,y1,x2,y2} } in 0-1 normalised
    });
  };

  if (loading) {
    return (
      <div style={{ padding: "80px 24px", textAlign: "center" }}>
        <div style={{ width: 32, height: 1, background: T.dark, margin: "0 auto 32px" }} />
        <Label style={{ display: "block", color: T.black, marginBottom: 16 }}>Detecting Swimmers</Label>
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          Running pose detection on first 5 seconds...
        </p>
      </div>
    );
  }

  // Page 2: lane rope drawing
  if (page === "ropes") {
    const bestFrame = frames.find(f => f.poses.length > 0) || frames[0];
    return <LaneRopeStep frame={bestFrame} onConfirm={handleRopesConfirm} onBack={() => setPage("swimmer")} />;
  }

  // Page 1: swimmer confirmation
  const totalPoses = frames.reduce((s, f) => s + f.poses.length, 0);

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 160 }}>
      <div style={{ padding: "32px 24px 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 14px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Step 1 of 2</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 8 }}>
          Confirm Swimmer
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, margin: "14px 0 0" }}>
          {totalPoses === 0
            ? "No people detected in the first 5 seconds. Proceed anyway -- tracking will use your initial selection box."
            : "Tap the bounding box around your swimmer. This anchors the tracker to the right person."}
        </p>
      </div>

      {error && (
        <div style={{ margin: "0 24px 16px", padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>{error}</div>
      )}

      {!error && frames.length > 0 && totalPoses === 0 && (
        <div style={{ margin: "0 24px 16px", padding: "12px 14px", background: "#FFF5EB", borderLeft: `3px solid #C4610A` }}>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#C4610A", marginBottom: 8, lineHeight: 1.5 }}>
            No people detected. The AI pose detector may still be loading -- tap Retry in a few seconds. Or proceed without pose detection.
          </div>
          <button onClick={() => {
            setLoading(true); setFrames([]); setSelected(null);
            extractPreviewFrames(videoFile)
              .then(f => { setFrames(f); setLoading(false);
                const all = f.flatMap((fr, fi) => fr.poses.map(p => ({ fi, pi: p.idx })));
                if (all.length === 1) setSelected({ frameIdx: all[0].fi, poseIdx: all[0].pi });
              })
              .catch(e => { setError(e.message); setLoading(false); });
          }} style={{ background: "#C4610A", border: "none", color: "#fff", padding: "7px 16px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", letterSpacing: "0.06em" }}>
            Retry Detection
          </button>
        </div>
      )}

      {selected && (
        <div style={{ margin: "0 24px 16px", padding: "10px 14px", background: "#EBF7F4", borderLeft: `3px solid #007A5E`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#007A5E", fontWeight: 500 }}>
            Person {selected.poseIdx + 1} selected at {frames[selected.frameIdx]?.time.toFixed(1)}s
          </span>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 11, color: "#007A5E", cursor: "pointer" }}>Change</button>
        </div>
      )}

      {/* Frame list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
        {frames.map((frame, fi) => (
          <div key={fi}>
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              {frame.time.toFixed(1)}s -- {frame.poses.length} person{frame.poses.length !== 1 ? "s" : ""} detected
            </div>
            <div style={{ position: "relative" }}>
              <img
                src={`data:image/jpeg;base64,${frame.data}`}
                onClick={() => setEnlarged(fi)}
                style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", cursor: "pointer", border: `1px solid ${T.rule}` }}
              />
              {frame.poses.map(pose => {
                const isSel = selected?.frameIdx === fi && selected?.poseIdx === pose.idx;
                const bb = pose.bb;
                return (
                  <div key={pose.idx} onClick={() => handleSelect(fi, pose.idx)} style={{
                    position: "absolute",
                    left: `${bb.x * 100}%`, top: `${bb.y * 100}%`,
                    width: `${bb.w * 100}%`, height: `${bb.h * 100}%`,
                    border: `3px solid ${isSel ? "#007A5E" : pose.color}`,
                    background: isSel ? "rgba(0,122,94,0.15)" : "transparent",
                    boxShadow: isSel ? "0 0 0 3px rgba(0,122,94,0.3)" : "none",
                    cursor: "pointer", boxSizing: "border-box",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, background: isSel ? "#007A5E" : pose.color, color: "#fff", padding: "2px 6px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {isSel ? "Your swimmer" : `Person ${pose.idx + 1}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Enlarged modal */}
      {enlarged !== null && frames[enlarged] && (
        <div onClick={() => setEnlarged(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "70vh" }}>
            <img src={`data:image/jpeg;base64,${frames[enlarged].data}`} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }} />
            {frames[enlarged].poses.map(pose => {
              const isSel = selected?.frameIdx === enlarged && selected?.poseIdx === pose.idx;
              const bb = pose.bb;
              return (
                <div key={pose.idx} onClick={e => { e.stopPropagation(); handleSelect(enlarged, pose.idx); }} style={{
                  position: "absolute",
                  left: `${bb.x * 100}%`, top: `${bb.y * 100}%`,
                  width: `${bb.w * 100}%`, height: `${bb.h * 100}%`,
                  border: `3px solid ${isSel ? "#007A5E" : pose.color}`,
                  background: isSel ? "rgba(0,122,94,0.15)" : "transparent",
                  cursor: "pointer", boxSizing: "border-box",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, background: isSel ? "#007A5E" : pose.color, color: "#fff", padding: "2px 6px", fontSize: 11, fontWeight: 700 }}>
                    {isSel ? "Your swimmer" : `Person ${pose.idx + 1}`}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button onClick={e => { e.stopPropagation(); setEnlarged(i => Math.max(0, i-1)); }} style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>&larr;</button>
            <button onClick={() => setEnlarged(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>CLOSE</button>
            <button onClick={e => { e.stopPropagation(); setEnlarged(i => Math.min(frames.length-1, i+1)); }} style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>&rarr;</button>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div style={{ position: "fixed", bottom: 72, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.rule}`, padding: "14px 24px" }}>
        {!selected && totalPoses > 0 && (
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#C4610A", marginBottom: 8, textAlign: "center" }}>
            Tap a box to confirm your swimmer -- or skip to proceed
          </div>
        )}
        <Btn onClick={handleSwimmerConfirm}>
          {selected ? "Swimmer confirmed -- next: Lane Ropes" : "Skip -- Go to Lane Ropes"}
        </Btn>
      </div>
    </div>
  );
}
