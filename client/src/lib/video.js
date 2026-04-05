// --- Pixelation ---------------------------------------------------------------
export function pixelate(ctx, x, y, w, h, block = 14) {
  x = Math.round(x); y = Math.round(y);
  w = Math.round(w); h = Math.round(h);
  for (let bx = x; bx < x + w; bx += block) {
    for (let by = y; by < y + h; by += block) {
      const bw = Math.min(block, x + w - bx);
      const bh = Math.min(block, y + h - by);
      if (bw <= 0 || bh <= 0) continue;
      const d = ctx.getImageData(
        bx + Math.floor(bw / 2), by + Math.floor(bh / 2), 1, 1
      ).data;
      ctx.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`;
      ctx.fillRect(bx, by, bw, bh);
    }
  }
}

// --- Auto face detection -----------------------------------------------------
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

// --- Output resolution for analysis frames -----------------------------------
// 640x360 -- high enough for kinematics to be meaningful
const OUT_W = 640;
const OUT_H = 360;

// --- Exponential moving average for smooth tracking --------------------------
function ema(prev, next, alpha = 0.35) {
  if (prev === null) return next;
  return prev + alpha * (next - prev);
}

// --- Extract tracked frames with pose overlay --------------------------------
// initialCrop: {x,y,w,h} as 0-1 ratios from LaneSelector -- seeds the tracker
// redactZones: manual privacy boxes
// count: number of frames to extract
// stroke: used for angle selection in overlay
// onProgress: callback(done, total, phase)
// Returns: [{data: base64, frameIndex, timestamp, tracked, angles, approved: true}]
export async function extractTrackedFrames(
  videoFile, initialCrop, redactZones, count, stroke, onProgress
) {
  // Lazy-load pose module
  let detectPoses, closestPose, getPoseBoundingBox, drawPoseOverlay;
  try {
    const pm = await import("./pose.js");
    detectPoses      = pm.detectPoses;
    closestPose      = pm.closestPose;
    getPoseBoundingBox = pm.getPoseBoundingBox;
    drawPoseOverlay  = pm.drawPoseOverlay;
    if (onProgress) onProgress(0, count, "Loading pose detector...");
    // Warm up the detector
    await pm.initPoseDetector();
  } catch (e) {
    console.warn("[tracker] pose module unavailable:", e.message);
  }

  const frames = [];

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objUrl = URL.createObjectURL(videoFile);
    video.src = objUrl;

    video.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("Video failed to load"));
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const times = Array.from(
        { length: count },
        (_, i) => (duration / (count + 1)) * (i + 1)
      );

      // Tracking state -- smoothed target centre in 0-1 space
      let targetCx = (initialCrop?.x || 0) + (initialCrop?.w || 1) / 2;
      let targetCy = (initialCrop?.y || 0) + (initialCrop?.h || 1) / 2;
      let smoothCx = null, smoothCy = null;
      let smoothW  = null, smoothH  = null;

      // Full capture resolution
      const CAP_W = 1280, CAP_H = 720;

      let idx = 0;

      const next = () => {
        if (idx >= times.length) {
          URL.revokeObjectURL(objUrl);
          resolve(frames);
          return;
        }

        video.currentTime = times[idx];
        video.onseeked = async () => {
          try {
            // 1. Capture full frame at high resolution
            const full = document.createElement("canvas");
            full.width = CAP_W; full.height = CAP_H;
            full.getContext("2d").drawImage(video, 0, 0, CAP_W, CAP_H);

            // 2. Apply face blur to full frame first
            await tryAutoBlur(full);
            const fCtx = full.getContext("2d");
            redactZones.forEach(z =>
              pixelate(fCtx,
                (z.x / z.cw) * CAP_W, (z.y / z.ch) * CAP_H,
                (z.w / z.cw) * CAP_W, (z.h / z.ch) * CAP_H,
                16
              )
            );

            // 3. Detect poses on the full frame
            let tracked = false;
            let angles  = [];
            let cropBox = null;

            if (detectPoses) {
              // Use a smaller canvas for detection (faster)
              const det = document.createElement("canvas");
              det.width = 640; det.height = 360;
              det.getContext("2d").drawImage(full, 0, 0, 640, 360);

              const poses = await detectPoses(det);
              const match = closestPose(poses, targetCx, targetCy);

              if (match) {
                const bb = match.bb; // bb is now normalised 0-1
                tracked = true;

                // Smooth crop centre with EMA
                smoothCx = ema(smoothCx, bb.cx, 0.4);
                smoothCy = ema(smoothCy, bb.cy, 0.4);
                const newW = bb.w;
                const newH = bb.h;
                smoothW = smoothW === null ? newW : Math.max(newW, ema(smoothW, newW, 0.3));
                smoothH = smoothH === null ? newH : Math.max(newH, ema(smoothH, newH, 0.3));

                targetCx = smoothCx;
                targetCy = smoothCy;

                // Convert to pixel coords on full capture canvas
                const halfW = (smoothW / 2) * CAP_W;
                const halfH = (smoothH / 2) * CAP_H;
                cropBox = {
                  x: Math.max(0, Math.round(smoothCx * CAP_W - halfW)),
                  y: Math.max(0, Math.round(smoothCy * CAP_H - halfH)),
                  w: Math.min(CAP_W, Math.round(smoothW * CAP_W)),
                  h: Math.min(CAP_H, Math.round(smoothH * CAP_H)),
                };
              }
            }

            // 4. Fall back to initial crop if tracking failed
            if (!cropBox && initialCrop) {
              cropBox = {
                x: Math.round(initialCrop.x * CAP_W),
                y: Math.round(initialCrop.y * CAP_H),
                w: Math.round(initialCrop.w * CAP_W),
                h: Math.round(initialCrop.h * CAP_H),
              };
            }

            // 5. Create output canvas at 640x360
            const out = document.createElement("canvas");
            out.width = OUT_W; out.height = OUT_H;
            const oCtx = out.getContext("2d");

            if (cropBox && cropBox.w > 10 && cropBox.h > 10) {
              oCtx.drawImage(full,
                cropBox.x, cropBox.y, cropBox.w, cropBox.h,
                0, 0, OUT_W, OUT_H
              );
            } else {
              // No crop -- use full frame scaled down
              oCtx.drawImage(full, 0, 0, OUT_W, OUT_H);
            }

            // 6. Run pose overlay on the output crop
            if (drawPoseOverlay && tracked && cropBox) {
              // Re-detect on the cropped output for accurate overlay
              const poses2 = await detectPoses(out);
              if (poses2.length > 0) {
                angles = drawPoseOverlay(oCtx, poses2[0], OUT_W, OUT_H, stroke);
              }
            }

            // 7. Add frame index label
            oCtx.fillStyle = "rgba(0,0,0,0.55)";
            oCtx.fillRect(0, OUT_H - 22, 80, 22);
            oCtx.fillStyle = "#fff";
            oCtx.font = "10px 'Helvetica Neue', sans-serif";
            oCtx.fillText(`#${idx + 1}  ${times[idx].toFixed(1)}s`, 6, OUT_H - 7);
            if (tracked) {
              oCtx.fillStyle = "#007A5E";
              oCtx.fillRect(OUT_W - 58, OUT_H - 22, 58, 22);
              oCtx.fillStyle = "#fff";
              oCtx.fillText("tracked", OUT_W - 54, OUT_H - 7);
            }

            frames.push({
              data:       out.toDataURL("image/jpeg", 0.82).split(",")[1],
              frameIndex: idx,
              timestamp:  parseFloat(times[idx].toFixed(2)),
              tracked,
              angles,
              approved:   true,  // default approved, user can reject in review
            });

          } catch (e) {
            console.error(`[tracker] frame ${idx} error:`, e.message);
            // Push a placeholder so frame count is preserved
            frames.push({
              data: null, frameIndex: idx,
              timestamp: times[idx], tracked: false,
              angles: [], approved: false,
            });
          }

          idx++;
          if (onProgress) onProgress(idx, count, "Extracting & tracking");
          next();
        };
      };

      next();
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
    const rawTime = lap < laps / 2
      ? lapTime * lap * 1.02
      : lapTime * lap * 0.98;
    wallTimes.push(Math.min(rawTime, videoDurationSecs - 0.1));
  }

  const timestamps = new Set();
  wallTimes.forEach(wt => {
    for (let i = 0; i < framesPerZone; i++) {
      const offset = -windowSecs + (i / (framesPerZone - 1)) * windowSecs * 2;
      const t = Math.max(0.1, Math.min(wt + offset, videoDurationSecs - 0.1));
      timestamps.add(parseFloat(t.toFixed(2)));
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
        if (idx >= timestamps.length) {
          URL.revokeObjectURL(video.src);
          resolve(frames);
          return;
        }
        video.currentTime = timestamps[idx];
        video.onseeked = async () => {
          const full = document.createElement("canvas");
          full.width = W; full.height = H;
          full.getContext("2d").drawImage(video, 0, 0, W, H);

          let c;
          if (crop) {
            const sx = Math.round(crop.x * W), sy = Math.round(crop.y * H);
            const sw = Math.round(crop.w * W), sh = Math.round(crop.h * H);
            c = document.createElement("canvas");
            c.width = W; c.height = H;
            c.getContext("2d").drawImage(full, sx, sy, sw, sh, 0, 0, W, H);
          } else {
            c = full;
          }

          await tryAutoBlur(c);
          const ctx = c.getContext("2d");
          redactZones.forEach(z =>
            pixelate(ctx, (z.x / z.cw) * W, (z.y / z.ch) * H, (z.w / z.cw) * W, (z.h / z.ch) * H, 16)
          );

          const data = c.toDataURL("image/jpeg", 0.72).split(",")[1];
          frames.push({ data, time: timestamps[idx], zone: getZoneLabel(timestamps[idx], timestamps) });
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
