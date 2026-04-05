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

// --- Draw frame to output canvas with aspect-ratio letterboxing --------------
// Fills 640x360 with black then draws the crop centred maintaining AR
function drawCropLetterboxed(outCtx, srcCanvas, cropBox, outW, outH) {
  outCtx.fillStyle = "#000";
  outCtx.fillRect(0, 0, outW, outH);

  const { x, y, w, h } = cropBox;
  if (w < 10 || h < 10) {
    // Fallback: draw full frame scaled
    outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
    return;
  }

  const srcAR  = w / h;
  const outAR  = outW / outH;
  let dw, dh, dx, dy;
  if (srcAR > outAR) {
    // Crop is wider than output -- fit width, letterbox top/bottom
    dw = outW;
    dh = Math.round(outW / srcAR);
    dx = 0;
    dy = Math.round((outH - dh) / 2);
  } else {
    // Crop is taller than output -- fit height, pillarbox left/right
    dh = outH;
    dw = Math.round(outH * srcAR);
    dy = 0;
    dx = Math.round((outW - dw) / 2);
  }
  outCtx.drawImage(srcCanvas, x, y, w, h, dx, dy, dw, dh);
  return { dx, dy, dw, dh }; // return so we can remap landmarks
}

// --- Extract ALL frames with tracking + kinematics ---------------------------
// Extracts one frame every ~intervalSecs across the whole video.
// Returns all tracked frames -- FrameReview handles count selection.
// onProgress: (done, total, phase)
export async function extractTrackedFrames(
  videoFile, initialCrop, redactZones, intervalSecs = 0.5, stroke, onProgress
) {
  // Load pose module
  let poseModule = null;
  try {
    if (onProgress) onProgress(0, 1, "Loading AI pose detector...");
    poseModule = await import("./pose.js");
    await poseModule.initPoseDetector();
    console.log("[video] pose detector loaded");
  } catch (e) {
    console.warn("[video] pose unavailable:", e.message);
  }

  const OUT_W = 640, OUT_H = 360;
  const CAP_W = 1280, CAP_H = 720;

  const frames = [];

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objUrl = URL.createObjectURL(videoFile);
    video.src = objUrl;
    video.muted = true;

    video.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("Video failed to load")); };

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      // Build timestamp list -- every intervalSecs, capped at 80 frames
      const maxFrames = 80;
      const step = Math.max(intervalSecs, duration / maxFrames);
      const times = [];
      for (let t = 0.3; t < duration - 0.1; t += step) {
        times.push(parseFloat(t.toFixed(2)));
      }
      // Always include near-start and near-end
      if (times[0] > 0.3) times.unshift(0.3);
      const lastT = parseFloat((duration - 0.3).toFixed(2));
      if (times[times.length - 1] < lastT) times.push(lastT);

      console.log(`[video] extracting ${times.length} frames over ${duration.toFixed(1)}s`);
      if (onProgress) onProgress(0, times.length, "Starting...");

      // Tracking state in normalised 0-1 space
      let targetCx = (initialCrop?.x || 0) + (initialCrop?.w || 0.5) / 2;
      let targetCy = (initialCrop?.y || 0) + (initialCrop?.h || 0.5) / 2;
      let smoothCx = null, smoothCy = null;
      let smoothW  = null, smoothH  = null;
      let lastGoodCrop = null; // fallback if tracking lost
      let consecutiveLost = 0;

      for (let idx = 0; idx < times.length; idx++) {
        const t = times[idx];
        if (onProgress) onProgress(idx, times.length, `Tracking frame ${idx + 1} / ${times.length}`);

        // Seek video
        await new Promise(res => {
          video.currentTime = t;
          video.onseeked = res;
        });

        try {
          // 1. Capture full frame
          const full = document.createElement("canvas");
          full.width = CAP_W; full.height = CAP_H;
          full.getContext("2d").drawImage(video, 0, 0, CAP_W, CAP_H);

          // 2. Apply face blur to full frame
          await tryAutoBlur(full);
          const fCtx = full.getContext("2d");
          (redactZones || []).forEach(z =>
            pixelate(fCtx,
              (z.x / z.cw) * CAP_W, (z.y / z.ch) * CAP_H,
              (z.w / z.cw) * CAP_W, (z.h / z.ch) * CAP_H, 16)
          );

          // 3. Pose detection on scaled-down canvas for speed
          let tracked  = false;
          let cropBox  = null;
          let landmarks = null;

          if (poseModule) {
            const det = document.createElement("canvas");
            det.width = 640; det.height = 360;
            det.getContext("2d").drawImage(full, 0, 0, 640, 360);

            const poses = await poseModule.detectPoses(det);
            const match = poseModule.closestPose(poses, targetCx, targetCy);

            if (match && match.bb.confidence > 0.35) {
              const bb = match.bb;
              consecutiveLost = 0;

              // Only update smooth position if confidence is high enough
              // -- prevents drifting toward wrong person
              if (bb.confidence > 0.5) {
                smoothCx = ema(smoothCx, bb.cx, 0.35);
                smoothCy = ema(smoothCy, bb.cy, 0.35);
                // Size: grow quickly, shrink slowly -- prevents clipping swimmer
                const newW = Math.min(bb.w * 1.2, 0.9); // 20% padding, cap at 90% frame
                const newH = Math.min(bb.h * 1.3, 0.9);
                smoothW = smoothW === null ? newW : (newW > smoothW ? ema(smoothW, newW, 0.5) : ema(smoothW, newW, 0.1));
                smoothH = smoothH === null ? newH : (newH > smoothH ? ema(smoothH, newH, 0.5) : ema(smoothH, newH, 0.1));
                targetCx = smoothCx;
                targetCy = smoothCy;
              }

              // Crop box in pixel coords on full canvas
              const halfW = (smoothW / 2) * CAP_W;
              const halfH = (smoothH / 2) * CAP_H;
              cropBox = {
                x: Math.max(0, Math.round(smoothCx * CAP_W - halfW)),
                y: Math.max(0, Math.round(smoothCy * CAP_H - halfH)),
                w: Math.min(CAP_W, Math.round(smoothW * CAP_W)),
                h: Math.min(CAP_H, Math.round(smoothH * CAP_H)),
              };
              // Clamp to canvas bounds
              cropBox.w = Math.min(cropBox.w, CAP_W - cropBox.x);
              cropBox.h = Math.min(cropBox.h, CAP_H - cropBox.y);

              lastGoodCrop = { ...cropBox };
              tracked = true;

              // Remap landmarks to 640x360 detection space -> normalised
              landmarks = match.landmarks;
            } else {
              consecutiveLost++;
            }
          }

          // 4. Fallback crop
          if (!cropBox) {
            if (lastGoodCrop && consecutiveLost < 8) {
              cropBox = lastGoodCrop; // use last known good position
            } else if (initialCrop) {
              cropBox = {
                x: Math.round(initialCrop.x * CAP_W),
                y: Math.round(initialCrop.y * CAP_H),
                w: Math.round(initialCrop.w * CAP_W),
                h: Math.round(initialCrop.h * CAP_H),
              };
            }
          }

          // 5. Create output canvas with letterboxing
          const out = document.createElement("canvas");
          out.width = OUT_W; out.height = OUT_H;
          const oCtx = out.getContext("2d");
          const mapping = drawCropLetterboxed(oCtx, full, cropBox || { x: 0, y: 0, w: CAP_W, h: CAP_H }, OUT_W, OUT_H);

          // 6. Draw kinematics overlay on output canvas
          let angles = [];
          if (poseModule && tracked && landmarks && mapping) {
            // Remap normalised landmarks to output canvas coords
            // landmarks are normalised to the 640x360 detection canvas
            // which covers the full 1280x720 frame
            // We need to remap them to the output crop space
            const remapped = landmarks.map(lm => {
              if (!lm) return lm;
              // lm.x/y is normalised to full frame
              // crop is in CAP_W/CAP_H pixels
              const px = lm.x * CAP_W; // pixel position in full frame
              const py = lm.y * CAP_H;
              // Position relative to crop
              const relX = (px - cropBox.x) / cropBox.w;
              const relY = (py - cropBox.y) / cropBox.h;
              // Map to output canvas via letterbox mapping
              const outX = (mapping.dx + relX * mapping.dw) / OUT_W;
              const outY = (mapping.dy + relY * mapping.dh) / OUT_H;
              return { ...lm, x: outX, y: outY };
            });
            angles = poseModule.drawPoseOverlay(oCtx, remapped, OUT_W, OUT_H, stroke);
          }

          // 7. Overlay: timestamp + tracking status
          oCtx.fillStyle = "rgba(0,0,0,0.6)";
          oCtx.fillRect(0, OUT_H - 24, 110, 24);
          oCtx.fillStyle = "#fff";
          oCtx.font = "10px sans-serif";
          oCtx.fillText(`#${idx + 1}  ${t.toFixed(1)}s`, 6, OUT_H - 8);
          if (tracked) {
            oCtx.fillStyle = "#007A5E";
            oCtx.fillRect(OUT_W - 64, OUT_H - 24, 64, 24);
            oCtx.fillStyle = "#fff";
            oCtx.fillText("tracked", OUT_W - 60, OUT_H - 8);
          } else {
            oCtx.fillStyle = "#C4610A";
            oCtx.fillRect(OUT_W - 48, OUT_H - 24, 48, 24);
            oCtx.fillStyle = "#fff";
            oCtx.fillText("no pose", OUT_W - 44, OUT_H - 8);
          }

          frames.push({
            data:       out.toDataURL("image/jpeg", 0.88).split(",")[1],
            frameIndex: idx,
            timestamp:  t,
            tracked,
            angles,
            approved:   true,
          });

        } catch (e) {
          console.error(`[video] frame ${idx} error:`, e.message);
          frames.push({ data: null, frameIndex: idx, timestamp: t, tracked: false, angles: [], approved: false });
        }
      }

      URL.revokeObjectURL(objUrl);
      if (onProgress) onProgress(times.length, times.length, "Done");
      console.log(`[video] extracted ${frames.length} frames, ${frames.filter(f=>f.tracked).length} tracked`);
      resolve(frames);
    };

    video.load();
  });
}

// --- Smart lap-aware timestamps (for timing analysis) ------------------------
export function lapAwareTimestamps(videoDurationSecs, recentPbSecs, event, poolLength, framesPerZone = 5, windowSecs = 1.0) {
  const dist    = parseInt(event) || 100;
  const laps    = dist / poolLength;
  const lapTime = recentPbSecs / laps;
  const wallTimes = [];
  for (let lap = 1; lap <= laps; lap++) {
    const raw = lap < laps / 2 ? lapTime * lap * 1.02 : lapTime * lap * 0.98;
    wallTimes.push(Math.min(raw, videoDurationSecs - 0.1));
  }
  const timestamps = new Set();
  wallTimes.forEach(wt => {
    for (let i = 0; i < framesPerZone; i++) {
      const offset = -windowSecs + (i / (framesPerZone - 1)) * windowSecs * 2;
      timestamps.add(parseFloat(Math.max(0.1, Math.min(wt + offset, videoDurationSecs - 0.1)).toFixed(2)));
    }
  });
  [0.5, 1.0, 1.8].forEach(t => { if (t < videoDurationSecs) timestamps.add(t); });
  [-0.5, -0.2].forEach(o => timestamps.add(parseFloat(Math.max(0.1, videoDurationSecs + o).toFixed(2))));
  return [...timestamps].sort((a, b) => a - b);
}

// --- Extract frames at specific timestamps (for timing analysis) -------------
export async function extractFramesAtTimes(videoFile, timestamps, redactZones = [], crop = null, onProgress = null) {
  const count = timestamps.length;
  const W = count <= 10 ? 480 : 320;
  const H = count <= 10 ? 270 : 180;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);
    const frames = [];
    let idx = 0;
    video.onloadedmetadata = () => {
      const next = () => {
        if (idx >= timestamps.length) { URL.revokeObjectURL(video.src); resolve(frames); return; }
        video.currentTime = timestamps[idx];
        video.onseeked = async () => {
          const full = document.createElement("canvas");
          full.width = W; full.height = H;
          full.getContext("2d").drawImage(video, 0, 0, W, H);
          let c;
          if (crop) {
            const sx = Math.round(crop.x*W), sy = Math.round(crop.y*H);
            const sw = Math.round(crop.w*W), sh = Math.round(crop.h*H);
            c = document.createElement("canvas"); c.width = W; c.height = H;
            c.getContext("2d").drawImage(full, sx, sy, sw, sh, 0, 0, W, H);
          } else { c = full; }
          await tryAutoBlur(c);
          const ctx = c.getContext("2d");
          (redactZones||[]).forEach(z => pixelate(ctx, (z.x/z.cw)*W, (z.y/z.ch)*H, (z.w/z.cw)*W, (z.h/z.ch)*H, 16));
          frames.push({ data: c.toDataURL("image/jpeg", 0.72).split(",")[1], time: timestamps[idx], zone: getZoneLabel(timestamps[idx], timestamps) });
          idx++;
          if (onProgress) onProgress(idx, timestamps.length);
          next();
        };
      };
      next();
    };
    video.load();
  });
}

function getZoneLabel(t, allTimes) {
  const max = Math.max(...allTimes);
  if (t <= 2.0) return "start";
  if (t >= max - 0.8) return "finish";
  return "wall-zone";
}
