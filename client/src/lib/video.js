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

// --- Extract N frames, optionally cropped to a swimmer region ----------------
// crop: { x, y, w, h } as 0–1 ratios of the full frame — null = full frame
// redactZones: privacy boxes in canvas-local coords (after crop is applied)
export async function extractFrames(videoFile, redactZones, count = 4, crop = null) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);
    const frames = [];

    video.onloadedmetadata = () => {
      const times = Array.from(
        { length: count },
        (_, i) => (video.duration / (count + 1)) * (i + 1)
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
          // -- Step 1: draw full frame at 480×270 ------------------------------
          const full = document.createElement("canvas");
          full.width = 480; full.height = 270;
          full.getContext("2d").drawImage(video, 0, 0, 480, 270);

          // -- Step 2: crop to swimmer region if provided ----------------------
          let c;
          if (crop) {
            const sx = Math.round(crop.x * 480);
            const sy = Math.round(crop.y * 270);
            const sw = Math.round(crop.w * 480);
            const sh = Math.round(crop.h * 270);

            // Output canvas: fixed 480×270 (stretches crop to fill — gives Claude
            // a consistently sized, zoomed-in view of just this swimmer)
            c = document.createElement("canvas");
            c.width = 480; c.height = 270;
            c.getContext("2d").drawImage(full, sx, sy, sw, sh, 0, 0, 480, 270);
          } else {
            c = full;
          }

          // -- Step 3: auto-blur faces -----------------------------------------
          await tryAutoBlur(c);

          // -- Step 4: apply manual redact zones ------------------------------
          const ctx = c.getContext("2d");
          redactZones.forEach((z) =>
            pixelate(
              ctx,
              (z.x / z.cw) * 480,
              (z.y / z.ch) * 270,
              (z.w / z.cw) * 480,
              (z.h / z.ch) * 270,
              16
            )
          );

          frames.push(c.toDataURL("image/jpeg", 0.75).split(",")[1]);
          idx++;
          next();
        };
      };
      next();
    };
    video.load();
  });
}
