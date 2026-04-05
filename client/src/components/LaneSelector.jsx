import { useState, useRef, useEffect } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";

// Preview canvas size (display resolution, not source resolution)
const CW = 480;
const CH = 270;

export function LaneSelector({ videoFile, onConfirm, onBack, accent }) {
  const canvasRef             = useRef();
  const [thumb, setThumb]     = useState(null);
  const [crop, setCrop]       = useState(null);   // confirmed crop { x,y,w,h } in canvas coords
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState(null);
  const [liveRect, setLiveRect] = useState(null);
  const [ready, setReady]     = useState(false);

  // -- Load middle frame as preview -------------------------------------------
  const [duration, setDuration]   = useState(0);
  const [seekTime, setSeekTime]   = useState(1.5);

  useEffect(() => {
    if (!videoFile) return;
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);
    video.onloadedmetadata = () => {
      const dur = video.duration;
      setDuration(dur);
      // Default to 1.5s -- usually shows swimmer on blocks or just entering water
      const t = Math.min(1.5, dur * 0.05);
      setSeekTime(t);
      video.currentTime = t;
      video.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = CW; c.height = CH;
        c.getContext("2d").drawImage(video, 0, 0, CW, CH);
        setThumb(c.toDataURL("image/jpeg", 0.85));
        URL.revokeObjectURL(video.src);
        setReady(true);
      };
    };
    video.load();
  }, [videoFile]);

  // Scrub to a different timestamp
  const handleScrub = (t) => {
    setSeekTime(t);
    setCrop(null);
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);
    video.onloadedmetadata = () => {
      video.currentTime = t;
      video.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = CW; c.height = CH;
        c.getContext("2d").drawImage(video, 0, 0, CW, CH);
        setThumb(c.toDataURL("image/jpeg", 0.85));
        URL.revokeObjectURL(video.src);
      };
    };
    video.load();
  };

  // -- Redraw canvas overlay --------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !thumb) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, CW, CH);
      ctx.drawImage(img, 0, 0);

      // Dim the whole frame first
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, CW, CH);

      const rect = liveRect || crop;

      if (rect) {
        // Cut out (reveal) the selected region at full brightness
        ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);

        // Draw border
        ctx.strokeStyle = liveRect ? accent : "#FFFFFF";
        ctx.lineWidth   = liveRect ? 1.5 : 2;
        ctx.setLineDash(liveRect ? [4, 3] : []);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.setLineDash([]);

        // Label (only on confirmed crop)
        if (crop && !liveRect) {
          ctx.fillStyle = accent;
          ctx.fillRect(crop.x, crop.y - 18, 68, 18);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 10px 'Helvetica Neue', sans-serif";
          ctx.fillText("SWIMMER", crop.x + 6, crop.y - 5);
        }
      } else {
        // No selection yet  show crosshair hint text
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font      = "12px 'Helvetica Neue', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Drag to select your swimmer", CW / 2, CH / 2);
        ctx.textAlign = "left";
      }
    };
    img.src = thumb;
  }, [thumb, crop, liveRect, accent]);

  // -- Pointer helpers --------------------------------------------------------
  const getPos = (e) => {
    const r  = canvasRef.current.getBoundingClientRect();
    const sx = CW / r.width, sy = CH / r.height;
    // touches[0] works for touchstart/touchmove
    // changedTouches[0] is needed for touchend (touches is empty on end)
    const touch = e.touches?.[0] ?? e.changedTouches?.[0];
    const cx = touch ? touch.clientX : e.clientX;
    const cy = touch ? touch.clientY : e.clientY;
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  };

  const onDown = (e) => {
    e.preventDefault();
    setCrop(null);
    setDrawing(true);
    setStartPt(getPos(e));
  };

  const onMove = (e) => {
    if (!drawing || !startPt) return;
    const p = getPos(e);
    setLiveRect({
      x: Math.min(startPt.x, p.x),
      y: Math.min(startPt.y, p.y),
      w: Math.abs(p.x - startPt.x),
      h: Math.abs(p.y - startPt.y),
    });
  };

  const onUp = (e) => {
    if (!drawing || !startPt) return;
    const p = getPos(e);
    const z = {
      x: Math.min(startPt.x, p.x),
      y: Math.min(startPt.y, p.y),
      w: Math.abs(p.x - startPt.x),
      h: Math.abs(p.y - startPt.y),
    };
    // 15px minimum in canvas coords - permissive enough for mobile fingers
    if (z.w > 15 && z.h > 15) setCrop(z);
    setDrawing(false);
    setStartPt(null);
    setLiveRect(null);
  };

  // Normalise crop to 01 ratios so video.js can apply it regardless of source res
  const handleConfirm = () => {
    if (!crop) return;
    onConfirm({
      x:  crop.x / CW,
      y:  crop.y / CH,
      w:  crop.w / CW,
      h:  crop.h / CH,
    });
  };

  if (!ready) return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <Label style={{ display: "block" }}>Loading preview</Label>
    </div>
  );

  return (
    <div style={{ background: T.white, minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ padding: "32px 24px 0" }}>
        <Label style={{ marginBottom: 6, color: accent }}>Step 1 of 3</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 8 }}>
          Select Swimmer
        </div>
        <Rule />
        <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.mid, lineHeight: 1.6, margin: "16px 0 20px" }}>
          Drag a box around your son so the AI focuses only on him  ignoring other swimmers and lanes.
        </p>
      </div>

      {/* Canvas */}
      <div style={{ margin: "0 24px 8px" }}>
        <canvas
          ref={canvasRef}
          width={CW} height={CH}
          style={{ width: "100%", display: "block", cursor: "crosshair", touchAction: "none", border: `1px solid ${T.rule}` }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />

        {/* Status line under canvas */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: crop ? T.dark : T.muted }}>
            {crop
              ? `Selection: ${Math.round(crop.w)}x${Math.round(crop.h)}px`
              : "No swimmer selected yet"}
          </span>
          {crop && (
            <button
              onClick={() => setCrop(null)}
              style={{ background: "none", border: `1px solid ${T.rule}`, color: T.mid, padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>
              Redraw
            </button>
          )}
        </div>

        {/* Scrubber */}
        {duration > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
                Frame at {seekTime.toFixed(1)}s
              </span>
              <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>
                {duration.toFixed(1)}s
              </span>
            </div>
            <input
              type="range" min={0} max={duration} step={0.1}
              value={seekTime}
              onChange={e => handleScrub(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: T.dark }}
            />
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginTop: 4 }}>
              Drag to find a clear view of the swimmer -- on blocks or standing still is ideal
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div style={{ margin: "16px 24px 24px", padding: "12px 16px", background: T.offWhite }}>
        <Label style={{ marginBottom: 8 }}>Tips for a good selection</Label>
        {[
          "Include the full body  head to toes",
          "A bit of water around him is fine",
          "If he moves across lanes, cover his full range",
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.muted, marginTop: 5, flexShrink: 0 }} />
            <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid }}>{t}</span>
          </div>
        ))}
      </div>

      <Rule style={{ margin: "0 24px 20px" }} />

      {/* Actions */}
      <div style={{ padding: "0 24px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn
          onClick={handleConfirm}
          accent={accent}
          style={{ opacity: crop ? 1 : 0.4, pointerEvents: crop ? "auto" : "none" }}>
          Confirm Selection 
        </Btn>
        <Btn onClick={onBack} variant="secondary"> Back</Btn>
      </div>
    </div>
  );
}
