import { useState, useRef, useEffect } from "react";
import { T } from "../tokens.js";
import { pixelate, tryAutoBlur } from "../lib/video.js";
import { Rule, Label, Btn } from "./ui.jsx";

export function PrivacyEditor({ videoFile, onConfirm, onBack, accent }) {
  const canvasRef = useRef();
  const [thumb, setThumb]         = useState(null);
  const [zones, setZones]         = useState([]);
  const [autoCount, setAutoCount] = useState(null);
  const [drawing, setDrawing]     = useState(false);
  const [startPt, setStartPt]     = useState(null);
  const [liveRect, setLiveRect]   = useState(null);
  const [ready, setReady]         = useState(false);

  // Extract first frame and run auto-detect
  useEffect(() => {
    if (!videoFile) return;
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);
    video.onloadedmetadata = () => {
      video.currentTime = video.duration * 0.25;
      video.onseeked = async () => {
        const c = document.createElement("canvas");
        c.width = 480; c.height = 270;
        c.getContext("2d").drawImage(video, 0, 0, 480, 270);
        const n = await tryAutoBlur(c);
        setAutoCount(n);
        setThumb(c.toDataURL("image/jpeg", 0.85));
        URL.revokeObjectURL(video.src);
        setReady(true);
      };
    };
    video.load();
  }, [videoFile]);

  // Redraw canvas on zone/liveRect changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !thumb) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, 480, 270);
      ctx.drawImage(img, 0, 0);
      zones.forEach((z) => {
        pixelate(ctx, z.x, z.y, z.w, z.h, 14);
        ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]); ctx.strokeRect(z.x, z.y, z.w, z.h);
        ctx.setLineDash([]);
      });
      if (liveRect) {
        ctx.fillStyle = "rgba(231,0,42,0.08)";
        ctx.fillRect(liveRect.x, liveRect.y, liveRect.w, liveRect.h);
        ctx.strokeStyle = T.red; ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]); ctx.strokeRect(liveRect.x, liveRect.y, liveRect.w, liveRect.h);
        ctx.setLineDash([]);
      }
    };
    img.src = thumb;
  }, [thumb, zones, liveRect, accent]);

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const sx = 480 / r.width, sy = 270 / r.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  };
  const onDown  = (e) => { e.preventDefault(); setDrawing(true); setStartPt(getPos(e)); };
  const onMove  = (e) => {
    if (!drawing || !startPt) return;
    const p = getPos(e);
    setLiveRect({ x: Math.min(startPt.x, p.x), y: Math.min(startPt.y, p.y), w: Math.abs(p.x - startPt.x), h: Math.abs(p.y - startPt.y) });
  };
  const onUp = (e) => {
    if (!drawing || !startPt) return;
    const p = getPos(e);
    const z = { x: Math.min(startPt.x, p.x), y: Math.min(startPt.y, p.y), w: Math.abs(p.x - startPt.x), h: Math.abs(p.y - startPt.y), cw: 480, ch: 270 };
    if (z.w > 8 && z.h > 8) setZones((prev) => [...prev, z]);
    setDrawing(false); setStartPt(null); setLiveRect(null);
  };

  if (!ready) return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <Label style={{ display: "block" }}>Loading preview…</Label>
    </div>
  );

  const autoOk = autoCount > 0;

  return (
    <div style={{ background: T.white, minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ padding: "32px 24px 0" }}>
        <Label style={{ marginBottom: 6, color: T.red }}>Privacy</Label>
        <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 8 }}>
          Face Obscuring
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.mid, lineHeight: 1.6, margin: "16px 0 20px" }}>
          All blurring runs locally on your device. Nothing is sent until you approve.
        </p>
      </div>

      {/* Auto-detect result */}
      <div style={{ margin: "0 24px 20px", padding: "14px 16px", background: T.offWhite, borderLeft: `3px solid ${autoOk ? T.strokes.Breaststroke.accent : T.strokes.Butterfly.accent}` }}>
        <Label style={{ marginBottom: 4, color: autoOk ? T.strokes.Breaststroke.accent : T.strokes.Butterfly.accent }}>
          {autoOk ? `${autoCount} face${autoCount > 1 ? "s" : ""} auto-detected` : "No faces auto-detected"}
        </Label>
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, margin: 0, lineHeight: 1.5 }}>
          {autoOk ? "Automatically pixelated. Draw additional zones if needed." : "Draw boxes manually over any faces or identifying features."}
        </p>
      </div>

      {/* Canvas editor */}
      <div style={{ margin: "0 24px 8px" }}>
        <Label style={{ marginBottom: 8 }}>Drag to redact</Label>
        <canvas ref={canvasRef} width={480} height={270}
          style={{ width: "100%", display: "block", cursor: "crosshair", touchAction: "none", border: `1px solid ${T.rule}` }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted }}>
            {zones.length} zone{zones.length !== 1 ? "s" : ""} added
          </span>
          {zones.length > 0 && (
            <button onClick={() => setZones([])}
              style={{ background: "none", border: `1px solid ${T.rule}`, color: T.mid, padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <Rule style={{ margin: "20px 24px" }} />

      {/* Privacy summary */}
      <div style={{ margin: "0 24px 24px" }}>
        {[["Sent to AI", "4 still frames, faces pixelated"], ["Stays on device", "Your original video, always"]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
            <Label style={{ paddingTop: 2, whiteSpace: "nowrap" }}>{k}</Label>
            <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark, textAlign: "right", lineHeight: 1.4 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: "0 24px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={() => onConfirm(zones)} accent={accent}>Confirm &amp; Analyze</Btn>
        <Btn onClick={onBack} variant="secondary">Back</Btn>
      </div>
    </div>
  );
}
