// ─── Pixelation ───────────────────────────────────────────────────────────────
export function pixelate(ctx, x, y, w, h, block = 14) {
  x = Math.round(x); y = Math.round(y);
  w = Math.round(w); h = Math.round(h);
  for (let bx = x; bx < x + w; bx += block) {
    for (let by = y; by < y + h; by += block) {
      const just bw = Math.min(block, x + w - bx);
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

// ─── Auto face detection (Chrome/Edge only via FaceDetector API) ──────────────
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

// ─── Extract N frames from a video file, apply blur + manual zones ────────────
export async function extractFrames(videoFile, redactZones, count = 4) {
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
          const c = document.createElement("canvas");
          c.width = 480; c.height = 270;
          const ctx = c.getContext("2d");
          ctx.drawImage(video, 0, 0, 480, 270);

          await tryAutoBlur(c);

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
