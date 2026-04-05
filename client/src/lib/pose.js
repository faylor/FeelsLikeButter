// --- MediaPipe Pose overlay for swimming analysis ----------------------------
// Lazy-loaded from CDN -- runs entirely in browser, no server needed

const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_KNEE: 25,     RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
};

const SKELETON = [
  [LM.LEFT_SHOULDER,  LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER,  LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW,     LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW,    LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER,  LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP,       LM.RIGHT_HIP],
  [LM.LEFT_HIP,       LM.LEFT_KNEE],
  [LM.RIGHT_HIP,      LM.RIGHT_KNEE],
  [LM.LEFT_KNEE,      LM.LEFT_ANKLE],
  [LM.RIGHT_KNEE,     LM.RIGHT_ANKLE],
];

function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x**2 + ab.y**2) * Math.sqrt(cb.x**2 + cb.y**2);
  if (mag === 0) return null;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI));
}

// Get bounding box of a pose in pixel coords
export function getPoseBoundingBox(landmarks, W, H, padding = 0.12) {
  const visible = landmarks.filter(l => l.visibility > 0.3);
  if (visible.length < 4) return null;
  const xs = visible.map(l => l.x);
  const ys = visible.map(l => l.y);
  const minX = Math.max(0, Math.min(...xs) - padding);
  const maxX = Math.min(1, Math.max(...xs) + padding);
  const minY = Math.max(0, Math.min(...ys) - padding);
  const maxY = Math.min(1, Math.max(...ys) + padding);
  return {
    x: minX * W, y: minY * H,
    w: (maxX - minX) * W,
    h: (maxY - minY) * H,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

// Get stroke-specific angles
function getStrokeAngles(stroke, lm) {
  const angles = [];
  const add = (label, a, b, c) => {
    const pa = lm[a], pb = lm[b], pc = lm[c];
    if (!pa || !pb || !pc) return;
    if (pa.visibility < 0.4 || pb.visibility < 0.4 || pc.visibility < 0.4) return;
    const deg = angleBetween(pa, pb, pc);
    if (deg !== null) angles.push({ label, deg, x: pb.x, y: pb.y });
  };

  // Body line vs horizontal
  const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
  if (ls && rs && ls.visibility > 0.4 && rs.visibility > 0.4) {
    const bodyAngle = Math.abs(Math.round(Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI));
    angles.push({ label: "body", deg: bodyAngle, x: (ls.x + rs.x) / 2, y: Math.min(ls.y, rs.y) - 0.04 });
  }

  if (stroke === "Freestyle" || stroke === "Backstroke") {
    add("L-elbow",    LM.LEFT_SHOULDER,  LM.LEFT_ELBOW,   LM.LEFT_WRIST);
    add("R-elbow",    LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW,  LM.RIGHT_WRIST);
    add("L-shoulder", LM.LEFT_ELBOW,     LM.LEFT_SHOULDER, LM.LEFT_HIP);
    add("R-shoulder", LM.RIGHT_ELBOW,    LM.RIGHT_SHOULDER,LM.RIGHT_HIP);
    // Hip rotation
    const lh = lm[LM.LEFT_HIP], rh = lm[LM.RIGHT_HIP];
    if (lh && rh && lh.visibility > 0.4 && rh.visibility > 0.4) {
      const hr = Math.abs(Math.round(Math.atan2(lh.y - rh.y, lh.x - rh.x) * 180 / Math.PI));
      angles.push({ label: "hip-rot", deg: hr, x: (lh.x + rh.x) / 2, y: lh.y });
    }
  }
  if (stroke === "Breaststroke") {
    add("L-elbow", LM.LEFT_SHOULDER, LM.LEFT_ELBOW,  LM.LEFT_WRIST);
    add("R-elbow", LM.RIGHT_SHOULDER,LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
    add("L-knee",  LM.LEFT_HIP,      LM.LEFT_KNEE,   LM.LEFT_ANKLE);
    add("R-knee",  LM.RIGHT_HIP,     LM.RIGHT_KNEE,  LM.RIGHT_ANKLE);
  }
  if (stroke === "Butterfly") {
    add("L-elbow", LM.LEFT_SHOULDER, LM.LEFT_ELBOW,   LM.LEFT_WRIST);
    add("R-elbow", LM.RIGHT_SHOULDER,LM.RIGHT_ELBOW,  LM.RIGHT_WRIST);
    add("L-hip",   LM.LEFT_SHOULDER, LM.LEFT_HIP,     LM.LEFT_KNEE);
    add("R-hip",   LM.RIGHT_SHOULDER,LM.RIGHT_HIP,    LM.RIGHT_KNEE);
  }
  return angles;
}

// Draw skeleton and angle labels on a canvas
export function drawPoseOverlay(ctx, landmarks, W, H, stroke) {
  if (!landmarks || landmarks.length === 0) return [];

  // Skeleton lines
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  SKELETON.forEach(([a, b]) => {
    const la = landmarks[a], lb = landmarks[b];
    if (!la || !lb || la.visibility < 0.3 || lb.visibility < 0.3) return;
    ctx.beginPath();
    ctx.moveTo(la.x * W, la.y * H);
    ctx.lineTo(lb.x * W, lb.y * H);
    ctx.stroke();
  });

  // Joint dots
  Object.values(LM).forEach(idx => {
    const l = landmarks[idx];
    if (!l || l.visibility < 0.3) return;
    ctx.fillStyle = l.visibility > 0.7 ? "#FFFFFF" : "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(l.x * W, l.y * H, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Angle labels
  const angles = getStrokeAngles(stroke, landmarks);
  ctx.font = "bold 11px 'Helvetica Neue', sans-serif";
  angles.forEach(({ label, deg, x, y }) => {
    const px = x * W, py = y * H - 16;
    const text = `${label} ${deg}`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "#E63946";
    ctx.fillRect(px - tw / 2 - 5, py - 11, tw + 10, 15);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(text, px, py);
    ctx.textAlign = "left";
  });

  return angles;
}

// --- Lazy-load MediaPipe detector --------------------------------------------
let detector = null;
let loadPromise = null;

export async function initPoseDetector() {
  if (detector) return detector;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Load MediaPipe Tasks Vision bundle from CDN
    if (!window.PoseLandmarker) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js";
        s.crossOrigin = "anonymous";
        s.onload = res;
        s.onerror = () => rej(new Error("Failed to load MediaPipe CDN"));
        document.head.appendChild(s);
      });
    }

    const { PoseLandmarker, FilesetResolver } = window;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    detector = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "IMAGE",
      numPoses: 3,  // detect up to 3 poses so we can pick the right swimmer
    });
    return detector;
  })();

  return loadPromise;
}

// --- Detect poses on a canvas, return all results ----------------------------
export async function detectPoses(canvas) {
  try {
    const det = await initPoseDetector();
    const result = det.detect(canvas);
    return result?.landmarks || [];
  } catch {
    return [];
  }
}

// --- Pick the pose closest to a target centre (0-1 normalised) ---------------
export function closestPose(poses, targetCx, targetCy, W, H) {
  if (!poses || poses.length === 0) return null;
  let best = null, bestDist = Infinity;
  poses.forEach(landmarks => {
    const bb = getPoseBoundingBox(landmarks, W, H);
    if (!bb) return;
    const dist = Math.hypot(bb.cx - targetCx, bb.cy - targetCy);
    if (dist < bestDist) { bestDist = dist; best = { landmarks, bb }; }
  });
  return best;
}
