import { useState, useEffect, useRef } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { extractPreviewFrames, extractRopeKeyframes } from "../lib/video.js";

const BOX_COLORS = ["#E63946", "#2196F3", "#FF9800", "#9C27B0"];

// --- Single rope drawing canvas ----------------------------------------------
function RopeCanvas({ frame, lines, onChange }) {
  const canvasRef = useRef();
  const [drawing, setDrawing] = useState(null);
  const [startPt, setStartPt] = useState(null);
  const [liveEnd, setLiveEnd] = useState(null);
  const CW = 640, CH = 360;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, CW, CH);
      ctx.drawImage(img, 0, 0, CW, CH);
      const drawLine = (line, color, label) => {
        if (!line) return;
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(line.x1 * CW, line.y1 * CH);
        ctx.lineTo(line.x2 * CW, line.y2 * CH);
        ctx.stroke();
        ctx.fillStyle = color; ctx.font = "bold 11px sans-serif";
        const tw = ctx.measureText(label).width;
        ctx.fillRect(line.x1 * CW, line.y1 * CH - 18, tw + 8, 18);
        ctx.fillStyle = "#000"; ctx.fillText(label, line.x1 * CW + 4, line.y1 * CH - 4);
      };
      drawLine(lines.upper, "#FFD600", "Upper");
      drawLine(lines.lower, "#00E5FF", "Lower");
      if (drawing && startPt && liveEnd) {
        const col = drawing === "upper" ? "#FFD600" : "#00E5FF";
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(startPt.x, startPt.y); ctx.lineTo(liveEnd.x, liveEnd.y);
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (!lines.upper && !lines.lower && !drawing) {
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, CH/2 - 16, CW, 32);
        ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Draw upper + lower rope", CW/2, CH/2 + 4); ctx.textAlign = "left";
      }
    };
    img.src = `data:image/jpeg;base64,${frame.data}`;
  }, [frame, lines, drawing, startPt, liveEnd]);

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const sx = CW / r.width, sy = CH / r.height;
    const touch = e.touches?.[0] ?? e.changedTouches?.[0];
    return { x: ((touch ? touch.clientX : e.clientX) - r.left) * sx,
             y: ((touch ? touch.clientY : e.clientY) - r.top ) * sy };
  };
  const onDown = (e) => { if (!drawing) return; e.preventDefault(); setStartPt(getPos(e)); setLiveEnd(null); };
  const onMove = (e) => { if (!drawing || !startPt) return; e.preventDefault(); setLiveEnd(getPos(e)); };
  const onUp   = (e) => {
    if (!drawing || !startPt) return;
    const end = getPos(e);
    if (Math.hypot(end.x - startPt.x, end.y - startPt.y) > 20)
      onChange({ ...lines, [drawing]: { x1: startPt.x/CW, y1: startPt.y/CH, x2: end.x/CW, y2: end.y/CH } });
    setDrawing(null); setStartPt(null); setLiveEnd(null);
  };

  const btn = (which, col) => ({
    flex: 1, padding: "9px 6px",
    border: `2px solid ${drawing === which ? col : lines[which] ? col+"99" : T.rule}`,
    background: drawing === which ? col : "none",
    color: drawing === which ? "#000" : lines[which] ? col : T.mid,
    cursor: "pointer", fontSize: 11, fontWeight: 500,
    fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
  });

  return (
    <div>
      <canvas ref={canvasRef} width={CW} height={CH}
        style={{ width: "100%", display: "block", cursor: drawing ? "crosshair" : "default", touchAction: "none" }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => setDrawing(d => d === "upper" ? null : "upper")} style={btn("upper", "#FFD600")}>
          {drawing === "upper" ? "Drawing..." : lines.upper ? "Redraw upper" : "Draw upper rope"}
        </button>
        <button onClick={() => setDrawing(d => d === "lower" ? null : "lower")} style={btn("lower", "#00E5FF")}>
          {drawing === "lower" ? "Drawing..." : lines.lower ? "Redraw lower" : "Draw lower rope"}
        </button>
      </div>
    </div>
  );
}

// --- Keyframe editor modal ---------------------------------------------------
function KeyframeEditor({ kf, onSave, onClose }) {
  const [lines, setLines] = useState({ upper: kf.upper, lower: kf.lower });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>
        Adjust ropes at {kf.time.toFixed(1)}s -- drag to redraw
      </div>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <RopeCanvas frame={kf} lines={lines} onChange={setLines} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        <button onClick={() => { onSave(lines); onClose(); }}
          style={{ background: T.dark, border: "none", color: "#fff", padding: "10px 24px", fontSize: 12, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
          Save
        </button>
        <button onClick={onClose}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "10px 24px", fontSize: 12, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Step 2: Rope keyframes --------------------------------------------------
function RopeKeyframesStep({ videoFile, initialSeed, onConfirm, onBack }) {
  const [keyframes, setKeyframes]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadMsg, setLoadMsg]       = useState("Extracting keyframes...");
  const [editing, setEditing]       = useState(null); // index being edited
  const [error, setError]           = useState(null);

  useEffect(() => {
    if (!videoFile) return;
    setLoading(true);
    extractRopeKeyframes(
      videoFile, 5.0, initialSeed,
      (msg) => setLoadMsg(msg)
    )
      .then(kfs => { setKeyframes(kfs); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, [videoFile]);

  const saveKf = (idx, lines) =>
    setKeyframes(prev => prev.map((kf, i) => i === idx ? { ...kf, ...lines } : kf));

  const bothDrawn = kf => kf.upper && kf.lower;
  const readyCount = keyframes.filter(bothDrawn).length;

  if (loading) return (
    <div style={{ padding: "80px 24px", textAlign: "center" }}>
      <div style={{ width: 32, height: 1, background: T.dark, margin: "0 auto 32px" }} />
      <Label style={{ display: "block", color: T.black, marginBottom: 12 }}>Detecting Lane Ropes</Label>
      <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted }}>{loadMsg}</p>
    </div>
  );

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 160 }}>
      <div style={{ padding: "24px 24px 16px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 12px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back
        </button>
        <Label style={{ color: T.red, marginBottom: 4 }}>Step 1 of 2 -- Lane Ropes</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 20, fontWeight: 300, color: T.black, marginBottom: 8 }}>
          Mark Lane Boundaries
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, margin: "12px 0 0" }}>
          Tap <strong>Adjust</strong> on each frame and draw the upper and lower ropes of your swimmer's lane.
          Everything outside the ropes is blacked out -- crowd cannot be detected. Draw on as many frames as possible.
        </p>
        {readyCount === 0 && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.red }}>
            Draw ropes on at least one keyframe to continue
          </div>
        )}
      </div>

      {error && (
        <div style={{ margin: "0 16px 12px", padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>{error}</div>
      )}

      {/* Keyframe grid */}
      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        {keyframes.map((kf, i) => {
          const ok = bothDrawn(kf);
          return (
            <div key={i} style={{ border: `2px solid ${ok ? "#007A5E" : T.rule}`, position: "relative" }}>
              {/* Thumbnail with rope overlaid */}
              <KeyframeThumbnail kf={kf} />
              {/* Overlay */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "4px 8px", background: "rgba(0,0,0,0.5)" }}>
                <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: "#fff" }}>
                  {kf.time.toFixed(1)}s
                </span>
                <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: ok ? "#00E676" : "#FFD600" }}>
                  {ok ? "Ropes set" : kf.upper || kf.lower ? "Partial" : "Not drawn yet"}
                </span>
              </div>
              <button onClick={() => setEditing(i)}
                style={{ position: "absolute", bottom: 6, right: 6, background: T.dark, border: "none", color: "#fff", padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
                Adjust
              </button>
            </div>
          );
        })}
      </div>

      {/* Editor modal */}
      {editing !== null && keyframes[editing] && (
        <KeyframeEditor
          kf={keyframes[editing]}
          onSave={(lines) => saveKf(editing, lines)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Action bar */}
      <div style={{ position: "fixed", bottom: 72, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.rule}`, padding: "14px 16px" }}>
        <Btn onClick={() => onConfirm(keyframes)}
          style={{ opacity: readyCount > 0 ? 1 : 0.4, pointerEvents: readyCount > 0 ? "auto" : "none" }}>
          {readyCount > 0 ? `Confirm ${keyframes.length} keyframes -- Start Processing` : "Draw ropes on at least one frame first"}
        </Btn>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, textAlign: "center", marginTop: 6 }}>
          Ropes will be interpolated between keyframes
        </div>
      </div>
    </div>
  );
}

// Thumbnail with rope lines drawn on it
function KeyframeThumbnail({ kf }) {
  const canvasRef = useRef();
  const CW = 320, CH = 180;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !kf?.data) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, CW, CH);
      const drawL = (line, col) => {
        if (!line) return;
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(line.x1*CW, line.y1*CH); ctx.lineTo(line.x2*CW, line.y2*CH); ctx.stroke();
      };
      drawL(kf.upper, "#FFD600");
      drawL(kf.lower, "#00E5FF");
    };
    img.src = `data:image/jpeg;base64,${kf.data}`;
  }, [kf]);
  return <canvas ref={canvasRef} width={CW} height={CH} style={{ width: "100%", display: "block" }} />;
}

// --- Step 2: Confirm swimmer (after ropes) -------------------------------------------------
export function VideoPreview({ videoFile, crop, onConfirm, onBack }) {
  const [frames, setFrames]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [enlarged, setEnlarged] = useState(null);
  const [ropeKeyframes, setRopeKeyframes] = useState([]);
  const [page, setPage]         = useState("ropes");

  useEffect(() => {
    if (!videoFile) return;
    setLoading(true); setError(null); setSelected(null); setPage("ropes");
    extractPreviewFrames(videoFile)
      .then(f => {
        setFrames(f); setLoading(false);
        const all = f.flatMap((fr, fi) => fr.poses.map(p => ({ fi, pi: p.idx })));
        if (all.length === 1) setSelected({ frameIdx: all[0].fi, poseIdx: all[0].pi });
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [videoFile]);

  const handleSelect    = (fi, pi) =>
    setSelected(prev => prev?.frameIdx === fi && prev?.poseIdx === pi ? null : { frameIdx: fi, poseIdx: pi });

  // Step 1: rope keyframes (first)
  if (page === "ropes") {
    // Seed position from selected swimmer or initial crop
    const frame = selected ? frames[selected.frameIdx] : null;
    const pose  = frame?.poses.find(p => p.idx === selected?.poseIdx);
    const initialSeed = pose?.bb
      ? { cx: pose.bb.cx, cy: pose.bb.cy }
      : crop ? { cx: crop.x + crop.w/2, cy: crop.y + crop.h/2 } : { cx: 0.5, cy: 0.5 };

    return (
      <RopeKeyframesStep
        videoFile={videoFile}
        initialSeed={initialSeed}
        onConfirm={(ropeKeyframes) => {
          // Store ropes and move to swimmer selection step
          setRopeKeyframes(ropeKeyframes);
          setPage("swimmer");
        }}
        onBack={onBack}
      />
    );
  }

  // Loading
  if (loading) return (
    <div style={{ padding: "80px 24px", textAlign: "center" }}>
      <div style={{ width: 32, height: 1, background: T.dark, margin: "0 auto 32px" }} />
      <Label style={{ display: "block", color: T.black, marginBottom: 16 }}>Detecting Swimmers</Label>
      <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
        Running pose detection from 10 seconds in...
      </p>
    </div>
  );

  const totalPoses = frames.reduce((s, f) => s + f.poses.length, 0);

  return (
    <div style={{ background: T.white, minHeight: "100vh", paddingBottom: 160 }}>
      <div style={{ padding: "32px 24px 20px" }}>
        <button onClick={() => setPage("ropes")} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 14px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          &larr; Back to Lane Ropes
        </button>
        <Label style={{ color: T.red, marginBottom: 6 }}>Step 2 of 2 -- Swimmer</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 8 }}>
          Confirm Swimmer
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.6, margin: "14px 0 0" }}>
          {totalPoses === 0
            ? "No people detected. Swimmer may be underwater. Tap Retry or proceed."
            : "Frames from ~10s in. Tap the box around your swimmer."}
        </p>
      </div>

      {error && <div style={{ margin: "0 24px 16px", padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>{error}</div>}

      {!error && frames.length > 0 && totalPoses === 0 && (
        <div style={{ margin: "0 24px 16px", padding: "12px 14px", background: "#FFF5EB", borderLeft: `3px solid #C4610A` }}>
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#C4610A", marginBottom: 8 }}>
            No people detected. The pose detector may still be loading.
          </div>
          <button onClick={() => {
            setLoading(true); setFrames([]);
            extractPreviewFrames(videoFile)
              .then(f => { setFrames(f); setLoading(false); })
              .catch(e => { setError(e.message); setLoading(false); });
          }} style={{ background: "#C4610A", border: "none", color: "#fff", padding: "7px 16px", fontSize: 11, cursor: "pointer", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
            Retry Detection
          </button>
        </div>
      )}

      {selected && (
        <div style={{ margin: "0 24px 16px", padding: "10px 14px", background: "#EBF7F4", borderLeft: "3px solid #007A5E", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#007A5E", fontWeight: 500 }}>
            Person {selected.poseIdx + 1} selected at {frames[selected.frameIdx]?.time.toFixed(1)}s
          </span>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 11, color: "#007A5E", cursor: "pointer" }}>Change</button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
        {frames.map((frame, fi) => (
          <div key={fi}>
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              {frame.time.toFixed(1)}s -- {frame.poses.length} person{frame.poses.length !== 1 ? "s" : ""} detected
            </div>
            <div style={{ position: "relative" }}>
              <img src={`data:image/jpeg;base64,${frame.data}`} onClick={() => setEnlarged(fi)}
                style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", cursor: "pointer", border: `1px solid ${T.rule}` }} />
              {frame.poses.map(pose => {
                const isSel = selected?.frameIdx === fi && selected?.poseIdx === pose.idx;
                const bb = pose.bb;
                return (
                  <div key={pose.idx} onClick={() => handleSelect(fi, pose.idx)} style={{
                    position: "absolute", left: `${bb.x*100}%`, top: `${bb.y*100}%`,
                    width: `${bb.w*100}%`, height: `${bb.h*100}%`,
                    border: `3px solid ${isSel ? "#007A5E" : pose.color}`,
                    background: isSel ? "rgba(0,122,94,0.15)" : "transparent",
                    cursor: "pointer", boxSizing: "border-box",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, background: isSel ? "#007A5E" : pose.color, color: "#fff", padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>
                      {isSel ? "Your swimmer" : `Person ${pose.idx + 1}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {enlarged !== null && frames[enlarged] && (
        <div onClick={() => setEnlarged(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "70vh" }}>
            <img src={`data:image/jpeg;base64,${frames[enlarged].data}`} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }} />
            {frames[enlarged].poses.map(pose => {
              const isSel = selected?.frameIdx === enlarged && selected?.poseIdx === pose.idx;
              const bb = pose.bb;
              return (
                <div key={pose.idx} onClick={e => { e.stopPropagation(); handleSelect(enlarged, pose.idx); }} style={{
                  position: "absolute", left: `${bb.x*100}%`, top: `${bb.y*100}%`,
                  width: `${bb.w*100}%`, height: `${bb.h*100}%`,
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

      <div style={{ position: "fixed", bottom: 72, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.rule}`, padding: "14px 24px" }}>
        {!selected && totalPoses > 0 && (
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: "#C4610A", marginBottom: 8, textAlign: "center" }}>
            Tap a box to confirm your swimmer
          </div>
        )}
        <Btn onClick={() => {
          const frame = selected ? frames[selected.frameIdx] : null;
          const pose  = frame?.poses.find(p => p.idx === selected?.poseIdx);
          onConfirm({
            landmarks:     pose?.landmarks || null,
            bb:            pose?.bb || null,
            time:          frame?.time,
            ropeKeyframes,
          });
        }}>
          {selected ? "Confirmed -- Start Processing" : "Skip -- Start Processing"}
        </Btn>
      </div>
    </div>
  );
}
