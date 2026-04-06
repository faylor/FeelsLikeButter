// --- Pixelation ---------------------------------------------------------------
export function pixelate(ctx, x, y, w, h, block = 14) {
  x = Math.round(x); y = Math.round(y);
  w = Math.round(w); h = Math.round(h);
  for (let bx = x; bx < x + w; bx += block) {
    for (let by = y; by < y + h; by += block) {
      const bw = Math.min(block, x + w - bx);
      const bh = Math.min(block, y + h - by);
      if (bw <= 0 || bh <= 0) continue;
      const d = ctx.getImageData(bx + Math.floor(bw/2), by + Math.floor(bh/2), 1, 1).data;
      ctx.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`;
      ctx.fillRect(bx, by, bw, bh);
    }
  }
}

// --- Auto face blur -----------------------------------------------------------
export async function tryAutoBlur(canvas) {
  if (!("FaceDetector" in window)) return 0;
  try {
    const faces = await new window.FaceDetector({ fastMode: true }).detect(canvas);
    const ctx = canvas.getContext("2d");
    faces.forEach(({ boundingBox: b }) =>
      pixelate(ctx, b.x - 10, b.y - 10, b.width + 20, b.height + 20, 14)
    );
    return faces.length;
  } catch { return 0; }
}

// --- EMA smoother ------------------------------------------------------------
function ema(prev, next, alpha = 0.4) {
  return prev === null ? next : prev + alpha * (next - prev);
}

// --- Letterbox-preserving draw -----------------------------------------------
function drawLetterboxed(outCtx, srcCanvas, sx, sy, sw, sh, outW, outH) {
  outCtx.fillStyle = "#111";
  outCtx.fillRect(0, 0, outW, outH);
  if (sw < 4 || sh < 4) {
    outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
    return { dx: 0, dy: 0, dw: outW, dh: outH };
  }
  const srcAR = sw / sh, outAR = outW / outH;
  let dw, dh, dx, dy;
  if (srcAR > outAR) {
    dw = outW; dh = Math.round(outW / srcAR); dx = 0; dy = Math.round((outH - dh) / 2);
  } else {
    dh = outH; dw = Math.round(outH * srcAR); dx = Math.round((outW - dw) / 2); dy = 0;
  }
  outCtx.drawImage(srcCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
  return { dx, dy, dw, dh };
}

// --- Seek video to a timestamp with timeout ----------------------------------
function seekTo(video, t) {
  return new Promise(res => {
    let done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    video.onseeked = finish;
    video.currentTime = t;
    setTimeout(finish, 2500); // fallback if onseeked never fires
  });
}

// --- Lane rope tracking -- consecutive-frame optical flow -------------------
// Tracks N anchor points along each rope from frame N-1 to frame N.
// Uses block matching on luminance patches -- no colour assumptions.
// Correctly follows any rotation (including anti-clockwise on rightward pan).
//
// Key difference from template matching:
//   OLD: frame 0 template vs frame N  -- template goes stale over long video
//   NEW: frame N-1 template vs frame N -- always fresh, follows actual motion

// Prevent ropes crossing
function preventRopeCrossing(upper, lower, minGap = 0.025) {
  if (!upper || !lower) return { upper, lower };
  const u = { ...upper }, l = { ...lower };
  if (u.y1 > l.y1 - minGap) { const m=(u.y1+l.y1)/2; u.y1=m-minGap/2; l.y1=m+minGap/2; }
  if (u.y2 > l.y2 - minGap) { const m=(u.y2+l.y2)/2; u.y2=m-minGap/2; l.y2=m+minGap/2; }
  return { upper: u, lower: l };
}

// Uses 640x360 capture -- high enough for analysis, safe on mobile memory
export async function extractTrackedFrames(
  videoFile, initialCrop, redactZones, intervalSecs = 0.5, stroke, onProgress,
  seedLandmarks = null, seedBb = null, ropeKeyframes = null, raceStartTime = null
) {
  const OUT_W = 640, OUT_H = 360;

  // Load pose detector -- await it so it's ready before frame 1
  let poseReady = false;
  let poseModule = null;
  try {
    if (onProgress) onProgress(0, 1, "Loading pose detector...");
    poseModule = await import("./pose.js");
    await poseModule.initPoseDetector();
    poseReady = true;
    console.log("[video] pose detector ready");
  } catch (e) {
    console.warn("[video] pose unavailable -- continuing without kinematics:", e.message);
  }

  if (onProgress) onProgress(0, 1, "Loading video...");

  // Single video element for everything -- avoids double-load crash on mobile
  const objUrl = URL.createObjectURL(videoFile);
  const video  = document.createElement("video");
  video.src        = objUrl;
  video.muted      = true;
  video.playsInline = true;
  video.preload    = "auto";

  // Wait for metadata with timeout
  const duration = await new Promise((res, rej) => {
    let done = false;
    const finish = (dur) => { if (!done) { done = true; res(dur); } };
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => { URL.revokeObjectURL(objUrl); rej(new Error("Video failed to load -- try a different format")); };
    video.load();
    setTimeout(() => finish(video.duration || 0), 12000);
  });

  if (!duration || duration < 0.3) {
    URL.revokeObjectURL(objUrl);
    throw new Error("Video too short or could not be read");
  }

  // Build timestamp list
  const maxFrames = 140;
  const step = Math.max(intervalSecs, duration / maxFrames);
  const times = [];
  for (let t = 0.3; t < duration - 0.1; t += step) {
    times.push(parseFloat(t.toFixed(2)));
  }
  if (!times.length || times[0] > 0.5) times.unshift(0.3);
  const lastT = parseFloat((duration - 0.3).toFixed(2));
  if (times[times.length - 1] < lastT) times.push(lastT);

  console.log(`[video] ${times.length} frames over ${duration.toFixed(1)}s`);
  if (onProgress) onProgress(0, times.length, `Extracting ${times.length} frames...`);

  // Tracking state -- initialise from confirmed seed if available
  let targetCx = seedBb ? seedBb.cx : (initialCrop?.x || 0) + (initialCrop?.w || 0.5) / 2;
  let targetCy = seedBb ? seedBb.cy : (initialCrop?.y || 0) + (initialCrop?.h || 0.5) / 2;
  let targetW  = seedBb ? seedBb.w  : (initialCrop?.w || 0.5);
  let targetH  = seedBb ? seedBb.h  : (initialCrop?.h || 0.5);
  let smoothCx = targetCx, smoothCy = targetCy;
  let lastGoodCrop = null;
  let lostCount = 0;
  // Velocity tracking -- reject physically impossible jumps
  let velCx = 0, velCy = 0;   // estimated velocity in normalised coords per second
  let prevTime = null;          // timestamp of last good detection

  // Lane rope tracking via optical flow -- anchor points tracked frame-to-frame
  // Rope positions interpolated from user-confirmed keyframes -- no tracking drift
  // activeRopes updated per-frame via interpolation

  // IoU helper -- prevents tracker jumping to wrong person
  function iou(a, b) {
    const ax2 = a.cx + a.w/2, ay2 = a.cy + a.h/2;
    const bx2 = b.cx + b.w/2, by2 = b.cy + b.h/2;
    const ix1 = Math.max(a.cx - a.w/2, b.cx - b.w/2);
    const iy1 = Math.max(a.cy - a.h/2, b.cy - b.h/2);
    const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
    const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
    const union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
  }

  const frames = [];

  // Reuse a single capture canvas -- avoids GC pressure
  const cap = document.createElement("canvas");
  cap.width = OUT_W; cap.height = OUT_H;
  const capCtx = cap.getContext("2d");

  for (let idx = 0; idx < times.length; idx++) {
    const t = times[idx];

    try {
      await seekTo(video, t);

      // 1. Capture frame at output resolution (not 1280x720 -- too much memory)
      capCtx.drawImage(video, 0, 0, OUT_W, OUT_H);

      // 2. Face blur
      await tryAutoBlur(cap);

      // 3. Apply manual redact zones
      (redactZones || []).forEach(z =>
        pixelate(capCtx,
          (z.x / z.cw) * OUT_W, (z.y / z.ch) * OUT_H,
          (z.w / z.cw) * OUT_W, (z.h / z.ch) * OUT_H, 14)
      );

      // 3. Interpolate rope positions from user keyframes
      const activeRopes = ropeKeyframes ? interpolateRopes(ropeKeyframes, t, raceStartTime) : { upper: null, lower: null };

      // Log every 10 frames so we can see what's happening without flooding console
      if (idx % 10 === 0) {
        console.log(`[frame ${idx} t=${t}s] ropes:`, {
          keyframes: ropeKeyframes?.length ?? 0,
          drawn: ropeKeyframes?.filter(k => k.upper || k.lower).length ?? 0,
          upper: activeRopes.upper ? `y1=${activeRopes.upper.y1.toFixed(3)} y2=${activeRopes.upper.y2.toFixed(3)}` : 'null',
          lower: activeRopes.lower ? `y1=${activeRopes.lower.y1.toFixed(3)} y2=${activeRopes.lower.y2.toFixed(3)}` : 'null',
        });
      }

      // 4a. Capture CLEAN frame for preview BEFORE masking
      const cleanCap = document.createElement("canvas");
      cleanCap.width = OUT_W; cleanCap.height = OUT_H;
      cleanCap.getContext("2d").drawImage(cap, 0, 0, OUT_W, OUT_H);

      // 4b. Mask outside lane on cap -- pure black, fully opaque
      if (activeRopes.upper || activeRopes.lower) {
        capCtx.save();
        capCtx.globalAlpha = 1.0;
        capCtx.globalCompositeOperation = "source-over";
        capCtx.fillStyle = "#000000";

        // Black out above upper rope
        if (activeRopes.upper) {
          const uy1 = activeRopes.upper.y1 * OUT_H;
          const uy2 = activeRopes.upper.y2 * OUT_H;
          capCtx.beginPath();
          capCtx.moveTo(0, 0);
          capCtx.lineTo(OUT_W, 0);
          capCtx.lineTo(OUT_W, uy2);
          capCtx.lineTo(0, uy1);
          capCtx.closePath();
          capCtx.fill();
        }

        // Black out below lower rope
        if (activeRopes.lower) {
          const ly1 = activeRopes.lower.y1 * OUT_H;
          const ly2 = activeRopes.lower.y2 * OUT_H;
          capCtx.beginPath();
          capCtx.moveTo(0, ly1);
          capCtx.lineTo(OUT_W, ly2);
          capCtx.lineTo(OUT_W, OUT_H);
          capCtx.lineTo(0, OUT_H);
          capCtx.closePath();
          capCtx.fill();
        }

        capCtx.restore();

        if (idx % 10 === 0) console.log(`[mask] applied at t=${t}s`);
      }

      // 4. Pose detection -- constrained to lane bounds + velocity filter
      let tracked   = false;
      let cropBox   = null;
      let landmarks = null;
      let poseBb    = null;

      const isDivePhase = t < 5.0;

      // After masking, pose detection should only find the swimmer
      // Keep loose bounds as a backup filter
      const laneMinY = (!isDivePhase && activeRopes?.upper)
        ? Math.min(activeRopes.upper.y1, activeRopes.upper.y2) - 0.04
        : 0;
      const laneMaxY = (!isDivePhase && activeRopes?.lower)
        ? Math.max(activeRopes.lower.y1, activeRopes.lower.y2) + 0.04
        : 1;

      // During dive, constrain X to seed area to avoid adjacent divers
      const diveMinX = isDivePhase ? Math.max(0, targetCx - 0.30) : 0;
      const diveMaxX = isDivePhase ? Math.min(1, targetCx + 0.30) : 1;

      if (poseReady && poseModule) {
        try {
          const poses = await poseModule.detectPoses(cap);

          let chosenMatch = null;
          if (poses.length > 0) {
            const prevBb   = { cx: smoothCx, cy: smoothCy, w: targetW, h: targetH };
            const dt       = prevTime !== null ? Math.max(0.05, t - prevTime) : 0.5;
            // Max plausible displacement per second (swimmer + camera pan)
            const maxSpeed = 0.55; // normalised units/sec -- ~35% frame width per second
            const maxDist  = maxSpeed * dt;
            let bestScore  = -1;

            poses.forEach(lms => {
              const bb = poseModule.getPoseBoundingBox(lms);
              if (!bb || bb.confidence < 0.25) return;

              // Lane constraint -- skip poses outside lane ropes (post-dive)
              if (!isDivePhase && (bb.cy < laneMinY || bb.cy > laneMaxY)) return;

              // Dive phase X constraint -- only accept poses near seed position
              // prevents adjacent divers (jumping in to same or adjacent lane) being picked
              if (isDivePhase && (bb.cx < diveMinX || bb.cx > diveMaxX)) return;

              // Velocity filter -- skip physically impossible jumps
              const dist = Math.hypot(bb.cx - smoothCx, bb.cy - smoothCy);
              if (lostCount === 0 && dist > maxDist) {
                console.log(`[track] rejected: dist=${dist.toFixed(2)} > max=${maxDist.toFixed(2)}`);
                return;
              }

              const overlap = iou(prevBb, bb);
              const score   = overlap * 0.6 + (1 - Math.min(dist, 1)) * 0.2 + bb.confidence * 0.2;
              if (score > bestScore) { bestScore = score; chosenMatch = { landmarks: lms, bb }; }
            });
          }

          if (chosenMatch && chosenMatch.bb.confidence > 0.25) {
            const bb = chosenMatch.bb;

            // Update velocity estimate
            if (prevTime !== null) {
              const dt = Math.max(0.05, t - prevTime);
              velCx = ema(velCx, (bb.cx - smoothCx) / dt, 0.3);
              velCy = ema(velCy, (bb.cy - smoothCy) / dt, 0.3);
            }
            prevTime = t;

            lostCount = 0;
            landmarks = chosenMatch.landmarks;
            tracked = true;
            poseBb = bb;

            smoothCx = ema(smoothCx, bb.cx, 0.45);
            smoothCy = ema(smoothCy, bb.cy, 0.45);
            targetCx = smoothCx; targetCy = smoothCy;
            targetW = bb.w; targetH = bb.h;

            // Orientation from shoulder line
            const ls = landmarks[11], rs = landmarks[12];
            let orientation = "upright";
            if (ls && rs && (ls.visibility||0) > 0.3 && (rs.visibility||0) > 0.3) {
              const angle = Math.abs(Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI);
              if (angle > 45) orientation = "horizontal";
              else if (angle > 20) orientation = "angled";
            }

            const padX = orientation === "horizontal" ? 0.22 : 0.15;
            const padY = orientation === "horizontal" ? 0.28 : 0.18;

            cropBox = {
              x: Math.max(0, Math.round((bb.cx - bb.w/2 - padX) * OUT_W)),
              y: Math.max(0, Math.round((bb.cy - bb.h/2 - padY) * OUT_H)),
              w: Math.min(OUT_W, Math.round((bb.w + padX*2) * OUT_W)),
              h: Math.min(OUT_H, Math.round((bb.h + padY*2) * OUT_H)),
            };
            cropBox.w = Math.min(cropBox.w, OUT_W - cropBox.x);
            cropBox.h = Math.min(cropBox.h, OUT_H - cropBox.y);

            // If lane ropes defined, clamp crop to stay within tracked lane
            if (activeRopes) {
              const upperY = activeRopes.upper
                ? Math.min(activeRopes.upper.y1, activeRopes.upper.y2) * OUT_H
                : 0;
              const lowerY = activeRopes.lower
                ? Math.max(activeRopes.lower.y1, activeRopes.lower.y2) * OUT_H
                : OUT_H;
              cropBox.y = Math.max(cropBox.y, upperY - 10);
              const bottom = Math.min(cropBox.y + cropBox.h, lowerY + 10);
              cropBox.h = bottom - cropBox.y;
            }

            lastGoodCrop = { ...cropBox };

          } else {
            lostCount++;

            // Progressively expand search area when pose is lost
            // After a few lost frames assume swimmer is moving fast -- show wider view
            if (lostCount > 3) {
              // Show increasingly wide crop centred on last known position
              const expansion = Math.min(0.15 * (lostCount - 3), 0.4);
              const cx = smoothCx ?? targetCx, cy = smoothCy ?? targetCy;
              cropBox = {
                x: Math.max(0, Math.round((cx - 0.35 - expansion) * OUT_W)),
                y: Math.max(0, Math.round((cy - 0.35 - expansion) * OUT_H)),
                w: Math.min(OUT_W, Math.round((0.7 + expansion*2) * OUT_W)),
                h: Math.min(OUT_H, Math.round((0.7 + expansion*2) * OUT_H)),
              };
              cropBox.w = Math.min(cropBox.w, OUT_W - cropBox.x);
              cropBox.h = Math.min(cropBox.h, OUT_H - cropBox.y);
              // After 8+ lost frames just show the full frame
              if (lostCount >= 8) cropBox = { x: 0, y: 0, w: OUT_W, h: OUT_H };
            }
          }
        } catch (poseErr) {
          console.warn("[video] pose error frame", idx, poseErr.message);
          lostCount++;
        }
      }

      // Fallback when pose not available
      if (!cropBox) {
        if (lostCount <= 3 && lastGoodCrop) {
          cropBox = lastGoodCrop;
        } else if (initialCrop) {
          cropBox = {
            x: Math.round(initialCrop.x * OUT_W), y: Math.round(initialCrop.y * OUT_H),
            w: Math.round(initialCrop.w * OUT_W), h: Math.round(initialCrop.h * OUT_H),
          };
        } else {
          cropBox = { x: 0, y: 0, w: OUT_W, h: OUT_H };
        }
      }

      // 5. Full-frame preview canvas -- drawn from CLEAN (unmasked) frame
      const preview = document.createElement("canvas");
      preview.width = OUT_W; preview.height = OUT_H;
      const pCtx = preview.getContext("2d");
      pCtx.drawImage(cleanCap, 0, 0, OUT_W, OUT_H);

      // Draw semi-transparent mask to show excluded regions
      if (activeRopes.upper || activeRopes.lower) {
        pCtx.fillStyle = "rgba(0,0,0,0.45)";
        if (activeRopes.upper) {
          const uy1 = activeRopes.upper.y1 * OUT_H, uy2 = activeRopes.upper.y2 * OUT_H;
          pCtx.beginPath();
          pCtx.moveTo(0, 0); pCtx.lineTo(OUT_W, 0);
          pCtx.lineTo(OUT_W, uy2); pCtx.lineTo(0, uy1);
          pCtx.closePath(); pCtx.fill();
        }
        if (activeRopes.lower) {
          const ly1 = activeRopes.lower.y1 * OUT_H, ly2 = activeRopes.lower.y2 * OUT_H;
          pCtx.beginPath();
          pCtx.moveTo(0, ly1); pCtx.lineTo(OUT_W, ly2);
          pCtx.lineTo(OUT_W, OUT_H); pCtx.lineTo(0, OUT_H);
          pCtx.closePath(); pCtx.fill();
        }

        // Draw thick solid rope lines right on the boundary
        const drawRopeLine = (rope, color, label) => {
          if (!rope) return;
          pCtx.shadowColor = color; pCtx.shadowBlur = 8;
          pCtx.strokeStyle = color; pCtx.lineWidth = 4; pCtx.setLineDash([]);
          pCtx.beginPath();
          pCtx.moveTo(0, rope.y1 * OUT_H);
          pCtx.lineTo(OUT_W, rope.y2 * OUT_H);
          pCtx.stroke();
          pCtx.shadowBlur = 0;
          // Label pill
          pCtx.fillStyle = color;
          pCtx.fillRect(6, rope.y1 * OUT_H - 18, 80, 18);
          pCtx.fillStyle = "#000";
          pCtx.font = "bold 10px sans-serif";
          pCtx.fillText(label, 10, rope.y1 * OUT_H - 5);
        };
        drawRopeLine(activeRopes.upper, "#FFD600", "Upper rope");
        drawRopeLine(activeRopes.lower, "#00E5FF", "Lower rope");
      }

      // Draw tight pose bounding box -- solid bright line shows detected person
      if (poseBb) {
        const bx = poseBb.x * OUT_W, by = poseBb.y * OUT_H;
        const bw = poseBb.w * OUT_W, bh = poseBb.h * OUT_H;
        // Filled semi-transparent background
        pCtx.fillStyle = "rgba(0,200,120,0.12)";
        pCtx.fillRect(bx, by, bw, bh);
        // Solid border
        pCtx.strokeStyle = "#00E676";
        pCtx.lineWidth = 2.5;
        pCtx.setLineDash([]);
        pCtx.strokeRect(bx, by, bw, bh);
        // Corner accents
        const cs = Math.min(bw, bh) * 0.18;
        pCtx.strokeStyle = "#FFFFFF";
        pCtx.lineWidth = 2;
        [[bx, by], [bx+bw, by], [bx, by+bh], [bx+bw, by+bh]].forEach(([cx, cy]) => {
          const sx = cx === bx ? 1 : -1, sy = cy === by ? 1 : -1;
          pCtx.beginPath();
          pCtx.moveTo(cx + sx * cs, cy);
          pCtx.lineTo(cx, cy);
          pCtx.lineTo(cx, cy + sy * cs);
          pCtx.stroke();
        });
        // Confidence label
        pCtx.fillStyle = "#00E676";
        pCtx.fillRect(bx, by - 18, 72, 18);
        pCtx.fillStyle = "#000";
        pCtx.font = "bold 10px sans-serif";
        pCtx.fillText(`tracked ${Math.round(poseBb.confidence * 100)}%`, bx + 4, by - 5);
      }

      // Draw padded crop box -- dashed, shows what goes to Claude
      if (cropBox && cropBox.w > 10 && poseBb) {
        pCtx.strokeStyle = "rgba(255,255,255,0.5)";
        pCtx.lineWidth = 1;
        pCtx.setLineDash([5, 4]);
        pCtx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
        pCtx.setLineDash([]);
      }

      // Untracked indicator
      if (!tracked) {
        pCtx.fillStyle = "rgba(196,97,10,0.7)";
        pCtx.fillRect(0, 0, OUT_W, 22);
        pCtx.fillStyle = "#fff";
        pCtx.font = "10px sans-serif";
        pCtx.textAlign = "center";
        pCtx.fillText("No person detected -- frame will not track correctly", OUT_W/2, 14);
        pCtx.textAlign = "left";
      }

      // Timestamp + tracked badge on preview
      pCtx.fillStyle = "rgba(0,0,0,0.65)"; pCtx.fillRect(0, OUT_H - 22, 110, 22);
      pCtx.fillStyle = "#fff"; pCtx.font = "10px sans-serif";
      pCtx.fillText(`${idx+1}/${times.length}  ${t.toFixed(1)}s`, 5, OUT_H - 7);
      if (tracked) {
        pCtx.fillStyle = "#007A5E"; pCtx.fillRect(OUT_W - 56, OUT_H - 22, 56, 22);
        pCtx.fillStyle = "#fff"; pCtx.fillText("tracked", OUT_W - 52, OUT_H - 7);
      }

      // 6. Cropped canvas (for sending to Claude -- letterboxed crop only)
      const out = document.createElement("canvas");
      out.width = OUT_W; out.height = OUT_H;
      const oCtx = out.getContext("2d");
      const mapping = drawLetterboxed(oCtx, cap, cropBox.x, cropBox.y, cropBox.w, cropBox.h, OUT_W, OUT_H);

      // 7. Kinematics overlay on cropped canvas
      let angles = [];
      if (poseReady && poseModule && tracked && landmarks && mapping) {
        try {
          const remapped = landmarks.map(lm => {
            if (!lm) return lm;
            const relX = (lm.x * OUT_W - cropBox.x) / cropBox.w;
            const relY = (lm.y * OUT_H - cropBox.y) / cropBox.h;
            return { ...lm,
              x: (mapping.dx + relX * mapping.dw) / OUT_W,
              y: (mapping.dy + relY * mapping.dh) / OUT_H,
            };
          });
          angles = poseModule.drawPoseOverlay(oCtx, remapped, OUT_W, OUT_H, stroke);
        } catch (e) { console.warn("[video] overlay error:", e.message); }
      }

      // 8. Lane ropes on cropped canvas too
      if (activeRopes && mapping) {
        const drawRope = (rope, color) => {
          if (!rope) return;
          const remap = (nx, ny) => ({
            x: mapping.dx + ((nx * OUT_W - cropBox.x) / cropBox.w) * mapping.dw,
            y: mapping.dy + ((ny * OUT_H - cropBox.y) / cropBox.h) * mapping.dh,
          });
          const p1 = remap(rope.x1, rope.y1), p2 = remap(rope.x2, rope.y2);
          oCtx.strokeStyle = color; oCtx.lineWidth = 1.5; oCtx.setLineDash([8, 4]);
          oCtx.beginPath(); oCtx.moveTo(p1.x, p1.y); oCtx.lineTo(p2.x, p2.y);
          oCtx.stroke(); oCtx.setLineDash([]);
        };
        drawRope(activeRopes.upper, "#FFD600");
        drawRope(activeRopes.lower, "#00E5FF");
      }

      frames.push({
        preview:    preview.toDataURL("image/jpeg", 0.82).split(",")[1], // full frame for review
        data:       out.toDataURL("image/jpeg", 0.85).split(",")[1],     // cropped for Claude
        frameIndex: idx, timestamp: t, tracked, angles, approved: true,
      });

    } catch (e) {
      console.error(`[video] frame ${idx} failed:`, e.message);
      frames.push({ data: null, frameIndex: idx, timestamp: t, tracked: false, angles: [], approved: false });
    }

    // Deliver completed frame to caller so review screen can stream it in
    if (onProgress) onProgress(idx + 1, times.length, `Frame ${idx + 1} / ${times.length}`, frames[frames.length - 1]);
  }

  URL.revokeObjectURL(objUrl);
  const tracked = frames.filter(f => f.tracked).length;
  console.log(`[video] done: ${frames.length} frames, ${tracked} tracked`);
  return frames;
}

// --- Extract keyframes every N seconds for rope drawing ---------------------
// Auto-detects rope position on each frame using edge detection as suggestion.
// User can then adjust in the UI. Returns [{time, data, upper, lower}]
export async function extractRopeKeyframes(videoFile, intervalSecs = 5.0, seedPos, onStatus) {
  if (onStatus) onStatus("Loading video...");
  const OUT_W = 640, OUT_H = 360;

  const objUrl = URL.createObjectURL(videoFile);
  const video  = document.createElement("video");
  video.src = objUrl; video.muted = true; video.playsInline = true; video.preload = "auto";

  const duration = await new Promise((res, rej) => {
    let done = false;
    const finish = d => { if (!done) { done = true; res(d || 0); } };
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => { URL.revokeObjectURL(objUrl); rej(new Error("Video failed to load")); };
    video.load();
    setTimeout(() => finish(video.duration || 0), 10000);
  });

  if (!duration || duration < 1) throw new Error("Video too short");

  // Build keyframe timestamps -- start from 0.5s
  const times = [];
  for (let t = 0.5; t < duration - 0.2; t += intervalSecs) {
    times.push(parseFloat(t.toFixed(2)));
  }
  if (times[times.length-1] < duration - 1.0)
    times.push(parseFloat((duration - 0.5).toFixed(2)));

  if (onStatus) onStatus(`Extracting ${times.length} keyframes...`);

  const keyframes = [];

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (onStatus) onStatus(`Keyframe ${i+1} / ${times.length} at ${t.toFixed(1)}s`);

    await new Promise(res => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      video.onseeked = finish; video.currentTime = t;
      setTimeout(finish, 2500);
    });

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W; canvas.height = OUT_H;
    canvas.getContext("2d").drawImage(video, 0, 0, OUT_W, OUT_H);

    // No auto-detection -- user must draw ropes manually on each keyframe
    // Auto-detection is unreliable; requiring explicit user input is more accurate
    keyframes.push({
      time:  t,
      data:  canvas.toDataURL("image/jpeg", 0.82).split(",")[1],
      upper: null,  // user must draw
      lower: null,  // user must draw
    });
  }

  URL.revokeObjectURL(objUrl);
  return keyframes;
}

// Auto-detect upper and lower rope positions using edge scan
function autoDetectRope(pixelData, W, H, prevUpper, prevLower) {
  const STRIPS  = 16, SCAN = Math.round(H * 0.12);

  const findStrongEdgeRow = (prevRope) => {
    const detected = [];
    for (let si = 0; si < STRIPS; si++) {
      const tx   = (si + 0.5) / STRIPS;
      const x0   = Math.round((si / STRIPS) * W);
      const x1   = Math.round(((si+1) / STRIPS) * W);
      const expY = Math.round((prevRope.y1 + (prevRope.y2 - prevRope.y1) * tx) * H);
      const y0   = Math.max(1, expY - SCAN), y1 = Math.min(H-2, expY + SCAN);
      let bestRow = -1, bestGrad = 0;
      for (let row = y0; row <= y1; row++) {
        let grad = 0;
        for (let col = x0; col < x1; col++) {
          const i1 = (row*W+col)*4, i2 = ((row+1)*W+col)*4;
          grad += Math.abs((pixelData[i1]*0.299+pixelData[i1+1]*0.587+pixelData[i1+2]*0.114)
                         - (pixelData[i2]*0.299+pixelData[i2+1]*0.587+pixelData[i2+2]*0.114));
        }
        if (grad > bestGrad) { bestGrad = grad; bestRow = row; }
      }
      const minGrad = (x1-x0) * 8;
      if (bestRow >= 0 && bestGrad > minGrad) detected.push({ x: tx, y: bestRow / H });
    }
    if (detected.length < Math.floor(STRIPS * 0.5)) return null;
    const n=detected.length, sx=detected.reduce((s,p)=>s+p.x,0), sy=detected.reduce((s,p)=>s+p.y,0);
    const sxy=detected.reduce((s,p)=>s+p.x*p.y,0), sx2=detected.reduce((s,p)=>s+p.x*p.x,0);
    const den=n*sx2-sx*sx;
    if (Math.abs(den) < 0.0001) return null;
    const slope=(n*sxy-sx*sy)/den, icept=(sy-slope*sx)/n;
    return { x1:0, y1:Math.max(0.02,Math.min(0.98,icept)), x2:1, y2:Math.max(0.02,Math.min(0.98,icept+slope)) };
  };

  return {
    upper: findStrongEdgeRow(prevUpper),
    lower: findStrongEdgeRow(prevLower),
  };
}

// Interpolate rope position between keyframes at time t
export function interpolateRopes(ropeKeyframes, t, raceStartTime = null) {
  if (!ropeKeyframes?.length) return { upper: null, lower: null };

  const upperDrawn = ropeKeyframes.filter(k => k.upper).map(k => ({ ...k, _r: k.upper }));
  const lowerDrawn = ropeKeyframes.filter(k => k.lower).map(k => ({ ...k, _r: k.lower }));

  const interp1 = (drawn, t) => {
    if (!drawn.length) return null;

    // Before race start -- use the race-start keyframe's ropes exactly, no tween
    // This prevents early dive frames getting wrongly interpolated rope positions
    if (raceStartTime !== null && t < raceStartTime) {
      const startKf = drawn.find(k => k.time >= raceStartTime) || drawn[0];
      return startKf._r;
    }

    if (t <= drawn[0].time) return drawn[0]._r;
    if (t >= drawn[drawn.length - 1].time) return drawn[drawn.length - 1]._r;
    for (let i = 0; i < drawn.length - 1; i++) {
      if (drawn[i].time <= t && drawn[i + 1].time >= t) {
        const a = (t - drawn[i].time) / (drawn[i + 1].time - drawn[i].time);
        const r1 = drawn[i]._r, r2 = drawn[i + 1]._r;
        return { x1: 0, y1: r1.y1 + a * (r2.y1 - r1.y1), x2: 1, y2: r1.y2 + a * (r2.y2 - r1.y2) };
      }
    }
    return drawn[drawn.length - 1]._r;
  };

  return {
    upper: interp1(upperDrawn, t),
    lower: interp1(lowerDrawn, t),
  };
}

// --- Smart lap-aware timestamps (for timing analysis) ------------------------
export function lapAwareTimestamps(videoDurationSecs, recentPbSecs, event, poolLength, framesPerZone = 5, windowSecs = 1.0) {
  const dist = parseInt(event) || 100, laps = dist / poolLength;
  const lapTime = recentPbSecs / laps;
  const wallTimes = [];
  for (let lap = 1; lap <= laps; lap++) {
    wallTimes.push(Math.min(lap < laps/2 ? lapTime*lap*1.02 : lapTime*lap*0.98, videoDurationSecs - 0.1));
  }
  const ts = new Set();
  wallTimes.forEach(wt => {
    for (let i = 0; i < framesPerZone; i++) {
      const o = -windowSecs + (i/(framesPerZone-1))*windowSecs*2;
      ts.add(parseFloat(Math.max(0.1, Math.min(wt+o, videoDurationSecs-0.1)).toFixed(2)));
    }
  });
  [0.5, 1.0, 1.8].forEach(t => { if (t < videoDurationSecs) ts.add(t); });
  [-0.5, -0.2].forEach(o => ts.add(parseFloat(Math.max(0.1, videoDurationSecs+o).toFixed(2))));
  return [...ts].sort((a, b) => a - b);
}

// --- Extract frames at specific timestamps (for timing analysis) -------------
export async function extractFramesAtTimes(videoFile, timestamps, redactZones = [], crop = null, onProgress = null) {
  const count = timestamps.length;
  const W = count <= 10 ? 480 : 320, H = count <= 10 ? 270 : 180;
  return new Promise(resolve => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);
    const frames = [];
    let idx = 0;
    video.onloadedmetadata = () => {
      const next = () => {
        if (idx >= timestamps.length) { URL.revokeObjectURL(video.src); resolve(frames); return; }
        video.currentTime = timestamps[idx];
        video.onseeked = async () => {
          const full = document.createElement("canvas"); full.width = W; full.height = H;
          full.getContext("2d").drawImage(video, 0, 0, W, H);
          let c;
          if (crop) {
            c = document.createElement("canvas"); c.width = W; c.height = H;
            c.getContext("2d").drawImage(full, Math.round(crop.x*W), Math.round(crop.y*H), Math.round(crop.w*W), Math.round(crop.h*H), 0, 0, W, H);
          } else { c = full; }
          await tryAutoBlur(c);
          const ctx = c.getContext("2d");
          (redactZones||[]).forEach(z => pixelate(ctx, (z.x/z.cw)*W, (z.y/z.ch)*H, (z.w/z.cw)*W, (z.h/z.ch)*H, 16));
          frames.push({ data: c.toDataURL("image/jpeg", 0.72).split(",")[1], time: timestamps[idx], zone: idx < 3 ? "start" : idx >= timestamps.length-2 ? "finish" : "wall-zone" });
          idx++; if (onProgress) onProgress(idx, timestamps.length); next();
        };
      };
      next();
    };
    video.load();
  });
}

// --- Quick 5-frame preview with pose bounding boxes for swimmer selection ----
// Samples from first 5 seconds, runs pose detection, draws numbered boxes
// Returns [{data, time, poses: [{bb, color, idx}]}]
// --- Quick 5-frame preview with pose bounding boxes for swimmer selection ----
export async function extractPreviewFrames(videoFile) {
  const OUT_W = 640, OUT_H = 360;
  const BOX_COLORS = ["#E63946", "#2196F3", "#FF9800", "#9C27B0"];

  // Load pose in background -- don't block video loading
  let poseModule = null, poseReady = false;
  import("./pose.js")
    .then(async pm => { poseModule = pm; await pm.initPoseDetector(); poseReady = true; console.log("[preview] pose ready"); })
    .catch(e => console.warn("[preview] pose unavailable:", e.message));

  // Single video element
  const objUrl = URL.createObjectURL(videoFile);
  const video  = document.createElement("video");
  video.src = objUrl; video.muted = true; video.playsInline = true; video.preload = "auto";

  const dur = await new Promise((res, rej) => {
    let done = false;
    const finish = d => { if (!done) { done = true; res(d || 0); } };
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => { URL.revokeObjectURL(objUrl); rej(new Error("Video failed to load -- try MP4 or MOV format")); };
    video.load();
    setTimeout(() => finish(video.duration || 0), 10000);
  });

  if (!dur || dur < 0.3) { URL.revokeObjectURL(objUrl); throw new Error("Video too short"); }

  // Start at 10s -- swimmer is above water and settled into their lane.
  // If video is shorter than 12s, fall back to 25-75% of duration.
  const startT = dur > 12 ? 10.0 : dur * 0.25;
  const endT   = Math.min(startT + 10.0, dur - 0.5);
  const span   = endT - startT;
  const times  = [0, 0.25, 0.5, 0.75, 1.0]
    .map(p => parseFloat((startT + p * span).toFixed(2)));

  const results = [];

  for (const t of times) {
    await new Promise(res => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      video.onseeked = finish; video.currentTime = t;
      setTimeout(finish, 2500);
    });

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W; canvas.height = OUT_H;
    canvas.getContext("2d").drawImage(video, 0, 0, OUT_W, OUT_H);

    let detectedPoses = [];
    if (poseReady && poseModule) {
      try {
        const poses = await poseModule.detectPoses(canvas);
        detectedPoses = poses
          .map((landmarks, i) => ({ landmarks, bb: poseModule.getPoseBoundingBox(landmarks), idx: i }))
          .filter(p => p.bb && p.bb.confidence > 0.25)
          .slice(0, 4);
      } catch (e) { console.warn("[preview] detect error:", e.message); }
    }

    // Draw bounding boxes on frame
    const ctx = canvas.getContext("2d");
    const BOX_COLS = BOX_COLORS;
    detectedPoses.forEach(({ bb, idx }) => {
      const col = BOX_COLS[idx % BOX_COLS.length];
      const x = bb.x * OUT_W, y = bb.y * OUT_H, w = bb.w * OUT_W, h = bb.h * OUT_H;
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
      const label = `Person ${idx + 1}`;
      ctx.font = "bold 13px sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = col; ctx.fillRect(x, y - 22, tw + 12, 22);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 6, y - 6);
    });

    if (detectedPoses.length === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, OUT_H/2 - 18, OUT_W, 36);
      ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(poseReady ? "No person detected" : "Pose detector loading...", OUT_W/2, OUT_H/2 + 5);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, OUT_H - 22, 70, 22);
    ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif";
    ctx.fillText(`${t.toFixed(1)}s`, 6, OUT_H - 7);

    results.push({
      data:  canvas.toDataURL("image/jpeg", 0.85).split(",")[1],
      time:  t,
      poses: detectedPoses.map(p => ({
        bb: p.bb, idx: p.idx,
        color: BOX_COLS[p.idx % BOX_COLS.length],
        landmarks: p.landmarks,
      })),
    });
  }

  URL.revokeObjectURL(objUrl);
  return results;
}
