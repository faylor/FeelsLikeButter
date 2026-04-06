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

const AF_W = 64, AF_H = 16; // wide patch captures multiple rope float cycles
const AF_SY = 28;            // vertical search +-28px
const AF_SX = 12;            // horizontal search +-12px (rope texture shifts with pan)
const AF_N  = 9;             // anchor points per rope

// Build initial anchor points along a rope line
function initAnchors(frameData, W, H, rope) {
  const anchors = [];
  for (let i = 0; i < AF_N; i++) {
    const tx = (i + 0.5) / AF_N;
    const cx = Math.round(tx * W);
    const cy = Math.round((rope.y1 + (rope.y2 - rope.y1) * tx) * H);
    anchors.push({ tx, cx, cy });
  }
  return anchors;
}

// Extract greyscale luminance patch centered at (cx,cy)
function getLuminancePatch(data, W, H, cx, cy) {
  const hw = AF_W >> 1, hh = AF_H >> 1;
  const patch = new Float32Array(AF_W * AF_H);
  for (let row = 0; row < AF_H; row++) {
    for (let col = 0; col < AF_W; col++) {
      const x = cx - hw + col, y = cy - hh + row;
      patch[row * AF_W + col] = (x >= 0 && x < W && y >= 0 && y < H)
        ? data[(y * W + x) * 4] * 0.299 + data[(y * W + x) * 4 + 1] * 0.587 + data[(y * W + x) * 4 + 2] * 0.114
        : 128;
    }
  }
  return patch;
}

// Track anchors from prevData to currData -- 2D search (horizontal + vertical)
function trackAnchors(prevData, currData, W, H, anchors) {
  const rawDys = [];
  const updated = anchors.map(a => {
    const prevPatch = getLuminancePatch(prevData, W, H, a.cx, a.cy);
    let bestDy = 0, bestDx = 0, bestSAD = Infinity;
    const hw = AF_W >> 1, hh = AF_H >> 1;

    for (let dy = -AF_SY; dy <= AF_SY; dy++) {
      for (let dx = -AF_SX; dx <= AF_SX; dx++) {
        const newCy = a.cy + dy, newCx = a.cx + dx;
        if (newCy < hh || newCy >= H - hh || newCx < hw || newCx >= W - hw) continue;
        let sad = 0;
        for (let row = 0; row < AF_H; row++) {
          for (let col = 0; col < AF_W; col++) {
            const x = newCx - hw + col, y = newCy - hh + row;
            const lum = (x >= 0 && x < W && y >= 0 && y < H)
              ? currData[(y * W + x) * 4] * 0.299 + currData[(y * W + x) * 4 + 1] * 0.587 + currData[(y * W + x) * 4 + 2] * 0.114
              : 128;
            sad += Math.abs(lum - prevPatch[row * AF_W + col]);
          }
        }
        if (sad < bestSAD) { bestSAD = sad; bestDy = dy; bestDx = dx; }
      }
    }

    const maxSAD = AF_W * AF_H * 32;
    const matched = bestSAD < maxSAD;
    if (matched) rawDys.push(bestDy);
    return { tx: a.tx, cx: a.cx + (matched ? bestDx : 0), cy: a.cy + (matched ? bestDy : 0) };
  });

  // Outlier rejection -- if an anchor moved very differently from the median, clamp it
  if (rawDys.length >= 4) {
    rawDys.sort((a, b) => a - b);
    const medDy = rawDys[Math.floor(rawDys.length / 2)];
    return updated.map((a, i) => {
      const dy = a.cy - anchors[i].cy;
      // If this anchor moved more than 12px away from median, clamp it
      if (Math.abs(dy - medDy) > 12) {
        return { ...a, cy: anchors[i].cy + medDy };
      }
      return a;
    });
  }
  return updated;
}

// Fit a rope line through current anchor positions
function anchorsToRope(anchors, H, prevRope) {
  const n   = anchors.length;
  const sx  = anchors.reduce((s, a) => s + a.tx,       0);
  const sy  = anchors.reduce((s, a) => s + a.cy / H,   0);
  const sxy = anchors.reduce((s, a) => s + a.tx * a.cy / H, 0);
  const sx2 = anchors.reduce((s, a) => s + a.tx * a.tx, 0);
  const den = n * sx2 - sx * sx;
  if (Math.abs(den) < 0.0001) return prevRope;
  const slope = (n * sxy - sx * sy) / den;
  const icept = (sy - slope * sx) / n;
  return {
    x1: 0, y1: Math.max(0.02, Math.min(0.98, icept)),
    x2: 1, y2: Math.max(0.02, Math.min(0.98, icept + slope)),
  };
}

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
  seedLandmarks = null, seedBb = null, laneRopes = null, ropeSeedTime = null
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

  // If rope seed time is known, insert it at the front of the list
  // This ensures anchor seeding happens on the exact frame the user drew on
  if (ropeSeedTime !== null && laneRopes) {
    const st = parseFloat(Math.max(0.1, Math.min(duration - 0.1, ropeSeedTime)).toFixed(2));
    if (!times.includes(st)) times.unshift(st);
    else times.sort((a, b) => a === st ? -1 : b === st ? 1 : a - b); // move to front
    console.log(`[video] rope seed frame inserted at t=${st}s`);
  }

  if (onProgress) onProgress(0, times.length, `Extracting ${times.length} frames...`);

  // Tracking state -- initialise from confirmed seed if available
  let targetCx = seedBb ? seedBb.cx : (initialCrop?.x || 0) + (initialCrop?.w || 0.5) / 2;
  let targetCy = seedBb ? seedBb.cy : (initialCrop?.y || 0) + (initialCrop?.h || 0.5) / 2;
  let targetW  = seedBb ? seedBb.w  : (initialCrop?.w || 0.5);
  let targetH  = seedBb ? seedBb.h  : (initialCrop?.h || 0.5);
  let smoothCx = targetCx, smoothCy = targetCy;
  let lastGoodCrop = null;
  let lostCount = 0;

  // Lane rope tracking via optical flow -- anchor points tracked frame-to-frame
  let activeRopes  = laneRopes ? {
    upper: laneRopes.upper ? { ...laneRopes.upper } : null,
    lower: laneRopes.lower ? { ...laneRopes.lower } : null,
  } : null;
  let ropeAnchors  = { upper: null, lower: null };
  let prevFrameData = null; // pixel data from previous frame for flow tracking

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

      // 3. Lane rope tracking -- optical flow frame-to-frame
      if (activeRopes) {
        const currData = capCtx.getImageData(0, 0, OUT_W, OUT_H).data;
        const isSeedFrame = ropeSeedTime !== null &&
          Math.abs(t - parseFloat(Math.max(0.1, Math.min(duration - 0.1, ropeSeedTime)).toFixed(2))) < 0.05;

        if (!prevFrameData || isSeedFrame) {
          // Seed anchors from this frame -- rope coords match exactly
          if (activeRopes.upper) ropeAnchors.upper = initAnchors(currData, OUT_W, OUT_H, activeRopes.upper);
          if (activeRopes.lower) ropeAnchors.lower = initAnchors(currData, OUT_W, OUT_H, activeRopes.lower);
          if (isSeedFrame) console.log(`[rope] anchors seeded on drawing frame t=${t}s`);
        } else {
          // Track anchors from previous frame to current frame
          if (ropeAnchors.upper) {
            ropeAnchors.upper = trackAnchors(prevFrameData, currData, OUT_W, OUT_H, ropeAnchors.upper);
            activeRopes.upper = anchorsToRope(ropeAnchors.upper, OUT_H, activeRopes.upper);
          }
          if (ropeAnchors.lower) {
            ropeAnchors.lower = trackAnchors(prevFrameData, currData, OUT_W, OUT_H, ropeAnchors.lower);
            activeRopes.lower = anchorsToRope(ropeAnchors.lower, OUT_H, activeRopes.lower);
          }
          const safe = preventRopeCrossing(activeRopes.upper, activeRopes.lower);
          activeRopes.upper = safe.upper;
          activeRopes.lower = safe.lower;
        }
        prevFrameData = currData;

        // Skip emitting the seed frame itself -- it's only for calibration
        if (isSeedFrame) {
          if (onProgress) onProgress(idx + 1, times.length, `Seeding rope anchors...`, null);
          continue;
        }
      }

      // 4. Pose detection on FULL FRAME -- then crop around result
      // Never crop before detecting -- swimmer may be outside initial box
      let tracked   = false;
      let cropBox   = null;
      let landmarks = null;
      let poseBb    = null;  // tight detected bounding box for preview overlay

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
            poseBb = bb;  // store for preview overlay

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

      // 5. Full-frame preview canvas (for review screen)
      const preview = document.createElement("canvas");
      preview.width = OUT_W; preview.height = OUT_H;
      const pCtx = preview.getContext("2d");
      pCtx.drawImage(cap, 0, 0, OUT_W, OUT_H);

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

      // Draw lane ropes on preview
      if (activeRopes) {
        const drawRopePreview = (rope, color) => {
          if (!rope) return;
          pCtx.strokeStyle = color; pCtx.lineWidth = 1.5;
          pCtx.setLineDash([8, 4]);
          pCtx.beginPath();
          pCtx.moveTo(rope.x1 * OUT_W, rope.y1 * OUT_H);
          pCtx.lineTo(rope.x2 * OUT_W, rope.y2 * OUT_H);
          pCtx.stroke(); pCtx.setLineDash([]);
        };
        drawRopePreview(activeRopes.upper, "#FFD600");
        drawRopePreview(activeRopes.lower, "#00E5FF");
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
