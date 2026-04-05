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
  videoFile, initialCrop, redactZones, intervalSecs = 0.5, stroke, onProgress
) {
  const OUT_W = 640, OUT_H = 360;

  // Start pose loading in background -- don't block frame extraction
  let poseReady = false;
  let poseModule = null;
  const poseLoadPromise = import("./pose.js")
    .then(async pm => {
      poseModule = pm;
      await pm.initPoseDetector();
      poseReady = true;
      console.log("[video] pose ready");
    })
    .catch(e => console.warn("[video] pose unavailable:", e.message));

  if (onProgress) onProgress(0, 1, "Loading video...");

  // Load video metadata
  const { duration } = await new Promise((res, rej) => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "metadata";
    v.onerror = () => rej(new Error("Video failed to load"));
    v.onloadedmetadata = () => res({ duration: v.duration });
    v.src = URL.createObjectURL(videoFile);
    v.load();
    setTimeout(() => rej(new Error("Video load timeout")), 15000);
  });

  if (!duration || duration < 0.3) throw new Error("Video too short");

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

  // Reuse a single video element for all seeks
  const video = document.createElement("video");
  const objUrl = URL.createObjectURL(videoFile);
  video.src = objUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise((res, rej) => {
    video.onloadedmetadata = res;
    video.onerror = () => rej(new Error("Video element failed"));
    video.load();
    setTimeout(res, 10000); // fallback
  });

  // Tracking state
  let targetCx = (initialCrop?.x || 0) + (initialCrop?.w || 0.5) / 2;
  let targetCy = (initialCrop?.y || 0) + (initialCrop?.h || 0.5) / 2;
  let smoothCx = null, smoothCy = null;
  let smoothW  = null, smoothH  = null;
  let lastGoodCrop = null;
  let lostCount = 0;

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

      // 4. Pose detection + tracking (only if pose module is ready)
      let tracked  = false;
      let cropBox  = null;
      let landmarks = null;

      if (poseReady && poseModule) {
        try {
          const poses = await poseModule.detectPoses(cap);
          const match = poseModule.closestPose(poses, targetCx, targetCy);

          if (match && match.bb.confidence > 0.3) {
            const bb = match.bb;
            lostCount = 0;

            // Only update smooth position with confident detections
            if (bb.confidence > 0.45) {
              smoothCx = ema(smoothCx, bb.cx, 0.35);
              smoothCy = ema(smoothCy, bb.cy, 0.35);
              const nw = Math.min(bb.w * 1.25, 0.95);
              const nh = Math.min(bb.h * 1.35, 0.95);
              smoothW  = smoothW  === null ? nw : (nw > smoothW  ? ema(smoothW, nw, 0.5)  : ema(smoothW, nw, 0.1));
              smoothH  = smoothH  === null ? nh : (nh > smoothH  ? ema(smoothH, nh, 0.5)  : ema(smoothH, nh, 0.1));
              targetCx = smoothCx;
              targetCy = smoothCy;
            }

            cropBox = {
              x: Math.max(0, Math.round((smoothCx - smoothW/2) * OUT_W)),
              y: Math.max(0, Math.round((smoothCy - smoothH/2) * OUT_H)),
              w: Math.min(OUT_W, Math.round(smoothW * OUT_W)),
              h: Math.min(OUT_H, Math.round(smoothH * OUT_H)),
            };
            cropBox.w = Math.min(cropBox.w, OUT_W - cropBox.x);
            cropBox.h = Math.min(cropBox.h, OUT_H - cropBox.y);
            lastGoodCrop = { ...cropBox };
            landmarks = match.landmarks;
            tracked = true;
          } else {
            lostCount++;
          }
        } catch (poseErr) {
          console.warn("[video] pose error frame", idx, poseErr.message);
        }
      }

      // Fallback crop
      if (!cropBox) {
        cropBox = lostCount < 10 && lastGoodCrop
          ? lastGoodCrop
          : initialCrop
            ? { x: Math.round(initialCrop.x * OUT_W), y: Math.round(initialCrop.y * OUT_H), w: Math.round(initialCrop.w * OUT_W), h: Math.round(initialCrop.h * OUT_H) }
            : { x: 0, y: 0, w: OUT_W, h: OUT_H };
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

      // 7. Status badge
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
