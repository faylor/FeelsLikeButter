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

// --- Extract ALL frames with tracking + kinematics ---------------------------
// Uses 640x360 capture -- high enough for analysis, safe on mobile memory
export async function extractTrackedFrames(
  videoFile, initialCrop, redactZones, intervalSecs = 0.5, stroke, onProgress,
  seedLandmarks = null, seedBb = null, laneRopes = null
) {
  const OUT_W = 640, OUT_H = 360;

  // Start pose loading in background -- don't block frame extraction
  let poseReady = false;
  let poseModule = null;
  import("./pose.js")
    .then(async pm => {
      poseModule = pm;
      await pm.initPoseDetector();
      poseReady = true;
      console.log("[video] pose ready");
    })
    .catch(e => console.warn("[video] pose unavailable:", e.message));

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
  const maxFrames = 80;
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

      // 4. Pose detection on FULL FRAME -- then crop around result
      // Never crop before detecting -- swimmer may be outside initial box
      let tracked   = false;
      let cropBox   = null;
      let landmarks = null;

      if (poseReady && poseModule) {
        try {
          const poses = await poseModule.detectPoses(cap);

          // Use IoU matching when we have a previous position (prevents drift)
          // Fall back to centre-distance for first frame
          let chosenMatch = null;
          if (poses.length > 0) {
            const prevBb = { cx: smoothCx, cy: smoothCy, w: targetW, h: targetH };
            let bestScore = -1;

            poses.forEach(lms => {
              const bb = poseModule.getPoseBoundingBox(lms);
              if (!bb || bb.confidence < 0.25) return;
              // Score = IoU with previous box (weighted) + proximity + confidence
              const overlap = iou(prevBb, bb);
              const dist    = Math.hypot(bb.cx - smoothCx, bb.cy - smoothCy);
              const score   = overlap * 0.6 + (1 - Math.min(dist, 1)) * 0.2 + bb.confidence * 0.2;
              if (score > bestScore) { bestScore = score; chosenMatch = { landmarks: lms, bb }; }
            });

            // Reject match if it jumps too far with low overlap (wrong person)
            if (chosenMatch) {
              const jumpDist = Math.hypot(chosenMatch.bb.cx - smoothCx, chosenMatch.bb.cy - smoothCy);
              const overlap  = iou(prevBb, chosenMatch.bb);
              if (jumpDist > 0.35 && overlap < 0.05 && lostCount === 0) {
                console.log(`[video] frame ${idx}: rejected jump dist=${jumpDist.toFixed(2)} iou=${overlap.toFixed(2)}`);
                chosenMatch = null;
              }
            }
          }

          if (chosenMatch && chosenMatch.bb.confidence > 0.25) {
            const bb = chosenMatch.bb;
            lostCount = 0;
            landmarks = chosenMatch.landmarks;
            tracked = true;

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

            // If lane ropes defined, clamp crop to stay within lane
            if (laneRopes) {
              const upperY = laneRopes.upper
                ? Math.min(laneRopes.upper.y1, laneRopes.upper.y2) * OUT_H
                : 0;
              const lowerY = laneRopes.lower
                ? Math.max(laneRopes.lower.y1, laneRopes.lower.y2) * OUT_H
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

      // 5. Create output frame with letterboxed crop
      const out = document.createElement("canvas");
      out.width = OUT_W; out.height = OUT_H;
      const oCtx = out.getContext("2d");
      const mapping = drawLetterboxed(oCtx, cap, cropBox.x, cropBox.y, cropBox.w, cropBox.h, OUT_W, OUT_H);

      // 6. Kinematics overlay
      let angles = [];
      if (poseReady && poseModule && tracked && landmarks && mapping) {
        try {
          // Remap landmarks from full-frame normalised to crop space
          const remapped = landmarks.map(lm => {
            if (!lm) return lm;
            const relX = (lm.x * OUT_W - cropBox.x) / cropBox.w;
            const relY = (lm.y * OUT_H - cropBox.y) / cropBox.h;
            return {
              ...lm,
              x: (mapping.dx + relX * mapping.dw) / OUT_W,
              y: (mapping.dy + relY * mapping.dh) / OUT_H,
            };
          });
          angles = poseModule.drawPoseOverlay(oCtx, remapped, OUT_W, OUT_H, stroke);
        } catch (e) {
          console.warn("[video] overlay error:", e.message);
        }
      }

      // 7. Draw lane rope reference lines on output frame
      if (laneRopes && mapping) {
        const drawRope = (rope, color) => {
          if (!rope) return;
          // Remap rope coords from full-frame normalised to output canvas
          const remap = (nx, ny) => ({
            x: mapping.dx + ((nx * OUT_W - (cropBox?.x||0)) / (cropBox?.w||OUT_W)) * mapping.dw,
            y: mapping.dy + ((ny * OUT_H - (cropBox?.y||0)) / (cropBox?.h||OUT_H)) * mapping.dh,
          });
          const p1 = remap(rope.x1, rope.y1), p2 = remap(rope.x2, rope.y2);
          oCtx.strokeStyle = color;
          oCtx.lineWidth = 1.5;
          oCtx.setLineDash([8, 4]);
          oCtx.beginPath();
          oCtx.moveTo(p1.x, p1.y);
          oCtx.lineTo(p2.x, p2.y);
          oCtx.stroke();
          oCtx.setLineDash([]);
        };
        drawRope(laneRopes.upper, "#FFD600");
        drawRope(laneRopes.lower, "#00E5FF");
      }

      // 8. Status badge
      oCtx.fillStyle = "rgba(0,0,0,0.65)";
      oCtx.fillRect(0, OUT_H - 22, 100, 22);
      oCtx.fillStyle = "#fff";
      oCtx.font = "10px sans-serif";
      oCtx.fillText(`${idx+1}/${times.length}  ${t.toFixed(1)}s`, 5, OUT_H - 7);
      if (tracked) {
        oCtx.fillStyle = "#007A5E";
        oCtx.fillRect(OUT_W - 56, OUT_H - 22, 56, 22);
        oCtx.fillStyle = "#fff";
        oCtx.fillText("tracked", OUT_W - 52, OUT_H - 7);
      }

      frames.push({
        data:       out.toDataURL("image/jpeg", 0.85).split(",")[1],
        frameIndex: idx, timestamp: t, tracked, angles, approved: true,
      });

    } catch (e) {
      console.error(`[video] frame ${idx} failed:`, e.message);
      frames.push({ data: null, frameIndex: idx, timestamp: t, tracked: false, angles: [], approved: false });
    }

    if (onProgress) onProgress(idx + 1, times.length, `Frame ${idx + 1} / ${times.length}`);
  }

  URL.revokeObjectURL(objUrl);
  const tracked = frames.filter(f => f.tracked).length;
  console.log(`[video] done: ${frames.length} frames, ${tracked} tracked`);
  return frames;
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

  const span  = Math.min(5.0, dur - 0.1);
  const times = [0, 0.25, 0.5, 0.75, 1.0]
    .map(p => parseFloat(Math.max(0.1, p * span).toFixed(2)));

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
