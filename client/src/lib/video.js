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
        bx + Math.floor(bw / 2),
        by + Math.floor(bh / 2),
        1, 1
      ).data;
      ctx.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`;
      ctx.fillRect(bx, by, bw, bh);
    }
  }
}

// --- Auto face detection (Chrome/Edge only via FaceDetector API) --------------
export async function tryAutoBlur(canvas) {
  if (!("FaceDetector" in window)) return 0;
  try {
    const faces = await new window.FaceDetector({ fastMode: true }).detect(canvas);
    const ctx = canvas.getContext("2d");
    faces.forEach(({ boundingBox: b }) =>
      pixelate(ctx, b.x - 10, b.y - 10, b.width + 20, b.height + 20, 14)
    );
    return faces.length;
  } catch {
    return 0;
  }
}

// --- Smart lap-aware timestamps -----------------------------------------------
// Returns sorted list of timestamps clustered around predicted wall touches.
// recentPbSecs: swimmer's recent PB in seconds (used to predict lap timing)
// event: e.g. "100m Freestyle"
// poolLength: 25 or 50
// framesPerZone: how many frames to sample around each predicted wall touch
// windowSecs: half-width of the sampling window around each predicted touch
export function lapAwareTimestamps(videoDurationSecs, recentPbSecs, event, poolLength, framesPerZone = 5, windowSecs = 1.0) {
  const dist      = parseInt(event) || 100;
  const laps      = dist / poolLength;
  const lapTime   = recentPbSecs / laps;

  // Predicted wall-touch times: end of each lap
  const wallTimes = [];
  for (let lap = 1; lap <= laps; lap++) {
    // Use a slight negative-split model: first half ~51%, second ~49%
    const rawTime = lap < laps / 2
      ? lapTime * lap * 1.02   // slightly slower in first half
      : lapTime * lap * 0.98;  // slightly faster in second half
    const predicted = Math.min(rawTime, videoDurationSecs - 0.1);
    wallTimes.push(predicted);
  }

  const timestamps = new Set();

  // Add frames spread around each predicted wall touch
  wallTimes.forEach(wt => {
    for (let i = 0; i < framesPerZone; i++) {
      const offset = -windowSecs + (i / (framesPerZone - 1)) * windowSecs * 2;
      const t = Math.max(0.1, Math.min(wt + offset, videoDurationSecs - 0.1));
      timestamps.add(parseFloat(t.toFixed(2)));
    }
  });

  // Add 3 frames near the start (reaction + early stroke)
  [0.5, 1.0, 1.8].forEach(t => {
    if (t < videoDurationSecs) timestamps.add(t);
  });

  // Add 2 frames near the finish
  [-0.5, -0.2].forEach(offset => {
    const t = parseFloat(Math.max(0.1, videoDurationSecs + offset).toFixed(2));
    timestamps.add(t);
  });

  return [...timestamps].sort((a, b) => a - b);
}

// --- Extract frames at specific timestamps ------------------------------------
// timestamps: sorted array of seconds to sample
// Otherwise same options as extractFrames
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
          redactZones.forEach((z) =>
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

// Label each frame by its zone for Claude context
function getZoneLabel(t, allTimes) {
  const max = Math.max(...allTimes);
  if (t <= 2.0) return "start";
  if (t >= max - 0.8) return "finish";
  return "wall-zone";
}
// crop: { x, y, w, h } as 0-1 ratios of the full frame -- null = full frame
// onProgress: optional callback(framesExtracted, total)
// withTimestamps: if true, returns [{data, time}] instead of [base64string]
export async function extractFrames(videoFile, redactZones, count = 60, crop = null, onProgress = null, withTimestamps = false) {
  // Scale resolution based on frame count to keep request size manageable
  const W = count <= 10 ? 480 : 320;
  const H = count <= 10 ? 270 : 180;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);
    const frames = [];

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const times = Array.from(
        { length: count },
        (_, i) => (duration / (count + 1)) * (i + 1)
      );
      let idx = 0;

      const next = () => {
        if (idx >= times.length) {
          URL.revokeObjectURL(video.src);
          resolve(frames);
          return;
        }
        video.currentTime = times[idx];
        video.onseeked = async () => {
          const full = document.createElement("canvas");
          full.width = W; full.height = H;
          full.getContext("2d").drawImage(video, 0, 0, W, H);

          let c;
          if (crop) {
            const sx = Math.round(crop.x * W);
            const sy = Math.round(crop.y * H);
            const sw = Math.round(crop.w * W);
            const sh = Math.round(crop.h * H);
            c = document.createElement("canvas");
            c.width = W; c.height = H;
            c.getContext("2d").drawImage(full, sx, sy, sw, sh, 0, 0, W, H);
          } else {
            c = full;
          }

          await tryAutoBlur(c);

          const ctx = c.getContext("2d");
          redactZones.forEach((z) =>
            pixelate(ctx, (z.x / z.cw) * W, (z.y / z.ch) * H, (z.w / z.cw) * W, (z.h / z.ch) * H, 16)
          );

          const data = c.toDataURL("image/jpeg", 0.70).split(",")[1];
          frames.push(withTimestamps ? { data, time: parseFloat(times[idx].toFixed(2)) } : data);
          idx++;
          if (onProgress) onProgress(idx, count);
          next();
        };
      };
      next();
    };
    video.load();
  });
}
