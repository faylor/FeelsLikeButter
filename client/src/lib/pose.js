// --- MediaPipe Pose overlay for swimming analysis ----------------------------
// Uses @mediapipe/tasks-vision via CDN (loaded dynamically)
// Annotates key joint angles onto canvas frames before sending to Claude

// MediaPipe landmark indices
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_KNEE: 25,     RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
};

// Skeleton connections to draw
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

// Calculate angle at joint B given points A, B, C (degrees)
function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return null;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return Math.round(Math.acos(cosAngle) * (180 / Math.PI));
}

// Body line angle vs horizontal (for rotation/body position)
function bodyLineAngle(lm) {
  const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
  if (!ls || !rs) return null;
  return Math.round(Math.atan2(ls.y - rs.y, ls.x - rs.x) * (180 / Math.PI));
}

// Hip rotation angle
function hipRotationAngle(lm) {
  const lh = lm[LM.LEFT_HIP], rh = lm[LM.RIGHT_HIP];
  if (!lh || !rh) return null;
  return Math.round(Math.atan2(lh.y - rh.y, lh.x - rh.x) * (180 / Math.PI));
}

// Key angles to measure per stroke
function getStrokeAngles(stroke, lm) {
  const angles = [];

  // Helper to add angle if landmarks are visible enough
  const add = (label, a, b, c) => {
    const pa = lm[a], pb = lm[b], pc = lm[c];
    if (!pa || !pb || !pc) return;
    if (pa.visibility < 0.4 || pb.visibility < 0.4 || pc.visibility < 0.4) return;
    const deg = angleBetween(pa, pb, pc);
    if (deg !== null) angles.push({ label, deg, x: pb.x, y: pb.y });
  };

  // Body line angle (always)
  const bla = bodyLineAngle(lm);
  if (bla !== null) {
    const ls = lm[LM.LEFT_SHOULDER];
    if (ls) angles.push({ label: "body", deg: Math.abs(bla), x: ls.x, y: ls.y - 0.05 });
  }

  if (stroke === "Freestyle" || stroke === "Backstroke") {
    add("L-elbow", LM.LEFT_SHOULDER,  LM.LEFT_ELBOW,  LM.LEFT_WRIST);
    add("R-elbow", LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
    add("L-shoulder", LM.LEFT_ELBOW,  LM.LEFT_SHOULDER,  LM.LEFT_HIP);
    add("R-shoulder", LM.RIGHT_ELBOW, LM.RIGHT_SHOULDER, LM.RIGHT_HIP);
    // Hip rotation
    const hr = hipRotationAngle(lm);
    if (hr !== null) {
      const lh = lm[LM.LEFT_HIP];
      if (lh) angles.push({ label: "hip-rot", deg: Math.abs(hr), x: lh.x, y: lh.y });
    }
  }

  if (stroke === "Breaststroke") {
    add("L-elbow", LM.LEFT_SHOULDER,  LM.LEFT_ELBOW,  LM.LEFT_WRIST);
    add("R-elbow", LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
    add("L-knee",  LM.LEFT_HIP,       LM.LEFT_KNEE,   LM.LEFT_ANKLE);
    add("R-knee",  LM.RIGHT_HIP,      LM.RIGHT_KNEE,  LM.RIGHT_ANKLE);
  }

  if (stroke === "Butterfly") {
    add("L-elbow", LM.LEFT_SHOULDER,  LM.LEFT_ELBOW,  LM.LEFT_WRIST);
    add("R-elbow", LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
    add("L-hip",   LM.LEFT_SHOULDER,  LM.LEFT_HIP,    LM.LEFT_KNEE);
    add("R-hip",   LM.RIGHT_SHOULDER, LM.RIGHT_HIP,   LM.RIGHT_KNEE);
  }

  return angles;
}

// Draw skeleton + angle labels onto a canvas
function drawOverlay(ctx, landmarks, W, H, stroke, accentColor = "#E63946") {
  if (!landmarks || landmarks.length === 0) return [];

  const lm = landmarks;
  const px = (l) => ({ x: l.x * W, y: l.y * H });

  // Draw skeleton lines
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  SKELETON.forEach(([a, b]) => {
    const la = lm[a], lb = lm[b];
    if (!la || !lb || la.visibility < 0.3 || lb.visibility < 0.3) return;
    const pa = px(la), pb = px(lb);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  });

  // Draw joint dots
  Object.values(LM).forEach(idx => {
    const l = lm[idx];
    if (!l || l.visibility < 0.3) return;
    const p = px(l);
    ctx.fillStyle = l.visibility > 0.7 ? "#FFFFFF" : "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Calculate and draw angle labels
  const angles = getStrokeAngles(stroke, lm);
  angles.forEach(({ label, deg, x, y }) => {
    const px_ = x * W;
    const py_ = y * H - 14;
    const text = `${label} ${deg}deg`;

    // Background pill
    ctx.font = "bold 9px 'Helvetica Neue', sans-serif";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = accentColor;
    ctx.fillRect(px_ - tw / 2 - 4, py_ - 10, tw + 8, 14);

    // Label text
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(text, px_, py_);
    ctx.textAlign = "left";
  });

  return angles;
}

// --- Lazy-load MediaPipe and create detector ---------------------------------
let detector = null;
let loadPromise = null;

export async function initPoseDetector() {
  if (detector) return detector;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Load MediaPipe Tasks Vision from CDN
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js";
    script.crossOrigin = "anonymous";
    await new Promise((res, rej) => {
      script.onload = res;
      script.onerror = () => rej(new Error("Failed to load MediaPipe CDN"));
      document.head.appendChild(script);
    });

    const { PoseLandmarker, FilesetResolver } = window.mediapipeTasks || window;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    detector = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "IMAGE",
      numPoses: 1,
    });
    return detector;
  })();

  return loadPromise;
}

// --- Run pose on a canvas and return annotated canvas + angle summary --------
export async function annotateFrame(canvas, stroke) {
  let det;
  try {
    det = await initPoseDetector();
  } catch {
    // MediaPipe unavailable (e.g. no CDN) -- return canvas unannotated
    return { canvas, angles: [], error: "MediaPipe unavailable" };
  }

  try {
    const result = det.detect(canvas);
    const landmarks = result?.landmarks?.[0];
    if (!landmarks || landmarks.length === 0) {
      return { canvas, angles: [], error: "No pose detected" };
    }

    const ctx = canvas.getContext("2d");
    const angles = drawOverlay(ctx, landmarks, canvas.width, canvas.height, stroke);
    return { canvas, angles, error: null };
  } catch (e) {
    return { canvas, angles: [], error: e.message };
  }
}
