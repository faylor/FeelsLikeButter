// --- MediaPipe Pose for swimming kinematics ----------------------------------
// Loaded dynamically from CDN at runtime -- not bundled by Vite
// CDN: @mediapipe/tasks-vision IIFE bundle exposes globals on window

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Landmark indices
const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_HIP: 23,      R_HIP: 24,
  L_KNEE: 25,     R_KNEE: 26,
  L_ANKLE: 27,    R_ANKLE: 28,
};

const SKELETON = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW],   [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],   [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP],     [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP,      LM.R_HIP],
  [LM.L_HIP,      LM.L_KNEE],    [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP,      LM.R_KNEE],    [LM.R_KNEE, LM.R_ANKLE],
];

function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x**2 + ab.y**2) * Math.sqrt(cb.x**2 + cb.y**2);
  if (mag < 0.0001) return null;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI);
}

// Bounding box of a pose -- normalised 0-1, with padding
export function getPoseBoundingBox(landmarks, padding = 0.15) {
  const vis = landmarks.filter(l => (l.visibility || 0) > 0.25);
  if (vis.length < 5) return null;
  const xs = vis.map(l => l.x), ys = vis.map(l => l.y);
  const minX = Math.max(0, Math.min(...xs) - padding);
  const maxX = Math.min(1, Math.max(...xs) + padding);
  const minY = Math.max(0, Math.min(...ys) - padding);
  const maxY = Math.min(1, Math.max(...ys) + padding);
  // Pose confidence = average visibility of core landmarks
  const core = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP];
  const conf = core.reduce((s, i) => s + (landmarks[i]?.visibility || 0), 0) / core.length;
  return {
    x: minX, y: minY, w: maxX - minX, h: maxY - minY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    confidence: conf,
  };
}

// Stroke-specific angle annotations
function getAngles(stroke, lm) {
  const angles = [];
  const add = (label, a, b, c) => {
    const pa = lm[a], pb = lm[b], pc = lm[c];
    if (!pa || !pb || !pc) return;
    if ((pa.visibility||0) < 0.35 || (pb.visibility||0) < 0.35 || (pc.visibility||0) < 0.35) return;
    const deg = angleBetween(pa, pb, pc);
    if (deg !== null) angles.push({ label, deg, x: pb.x, y: pb.y });
  };

  // Body line angle vs horizontal (always)
  const ls = lm[LM.L_SHOULDER], rs = lm[LM.R_SHOULDER];
  if (ls && rs && (ls.visibility||0) > 0.4 && (rs.visibility||0) > 0.4) {
    const deg = Math.abs(Math.round(Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI));
    angles.push({ label: "body", deg, x: (ls.x + rs.x) / 2, y: Math.min(ls.y, rs.y) - 0.07 });
  }

  if (stroke === "Freestyle" || stroke === "Backstroke") {
    add("L-elbow",    LM.L_SHOULDER, LM.L_ELBOW,    LM.L_WRIST);
    add("R-elbow",    LM.R_SHOULDER, LM.R_ELBOW,    LM.R_WRIST);
    add("L-shoulder", LM.L_ELBOW,    LM.L_SHOULDER, LM.L_HIP);
    add("R-shoulder", LM.R_ELBOW,    LM.R_SHOULDER, LM.R_HIP);
    const lh = lm[LM.L_HIP], rh = lm[LM.R_HIP];
    if (lh && rh && (lh.visibility||0) > 0.4 && (rh.visibility||0) > 0.4) {
      const deg = Math.abs(Math.round(Math.atan2(lh.y - rh.y, lh.x - rh.x) * 180 / Math.PI));
      angles.push({ label: "hip-rot", deg, x: (lh.x + rh.x) / 2, y: lh.y });
    }
  }
  if (stroke === "Breaststroke") {
    add("L-elbow", LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST);
    add("R-elbow", LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST);
    add("L-knee",  LM.L_HIP,      LM.L_KNEE,  LM.L_ANKLE);
    add("R-knee",  LM.R_HIP,      LM.R_KNEE,  LM.R_ANKLE);
  }
  if (stroke === "Butterfly") {
    add("L-elbow", LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST);
    add("R-elbow", LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST);
    add("L-hip",   LM.L_SHOULDER, LM.L_HIP,   LM.L_KNEE);
    add("R-hip",   LM.R_SHOULDER, LM.R_HIP,   LM.R_KNEE);
  }
  return angles;
}

// Draw skeleton + angle labels onto canvas
export function drawPoseOverlay(ctx, landmarks, W, H, stroke) {
  if (!landmarks?.length) return [];

  // Skeleton
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  SKELETON.forEach(([a, b]) => {
    const la = landmarks[a], lb = landmarks[b];
    if (!la || !lb || (la.visibility||0) < 0.25 || (lb.visibility||0) < 0.25) return;
    ctx.beginPath();
    ctx.moveTo(la.x * W, la.y * H);
    ctx.lineTo(lb.x * W, lb.y * H);
    ctx.stroke();
  });

  // Joint dots
  Object.values(LM).forEach(idx => {
    const l = landmarks[idx];
    if (!l || (l.visibility||0) < 0.25) return;
    ctx.fillStyle = (l.visibility||0) > 0.65 ? "#FFFFFF" : "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(l.x * W, l.y * H, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Angle labels
  const angles = getAngles(stroke, landmarks);
  ctx.font = "bold 12px sans-serif";
  angles.forEach(({ label, deg, x, y }) => {
    const px = x * W;
    const py = Math.max(16, Math.min(H - 8, y * H - 18));
    const text = `${label} ${deg}`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "#E63946";
    ctx.beginPath();
    ctx.roundRect?.(px - tw/2 - 5, py - 13, tw + 10, 17, 3);
    ctx.fill();
    if (!ctx.roundRect) {
      ctx.fillStyle = "#E63946";
      ctx.fillRect(px - tw/2 - 5, py - 13, tw + 10, 17);
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(text, px, py);
    ctx.textAlign = "left";
  });

  return angles;
}

// --- Singleton detector ------------------------------------------------------
let detector   = null;
let initPromise = null;

export async function initPoseDetector() {
  if (detector) return detector;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Load CDN bundle if not already loaded
    if (!window._mpVisionLoaded) {
      console.log("[pose] loading MediaPipe from CDN...");
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js";
        s.crossOrigin = "anonymous";
        s.onload = () => { window._mpVisionLoaded = true; res(); };
        s.onerror = () => rej(new Error("Failed to load MediaPipe CDN"));
        document.head.appendChild(s);
      });
      // Brief pause for globals to register
      await new Promise(r => setTimeout(r, 150));
    }

    // The IIFE bundle from @mediapipe/tasks-vision@0.10.14 puts exports
    // directly on window -- scan for PoseLandmarker
    let PoseLandmarker, FilesetResolver;

    // Try known namespace locations first
    for (const ns of [window, window.mpTasksVision, window.MediaPipeTasksVision, window.mediapipeTasks]) {
      if (ns?.PoseLandmarker && ns?.FilesetResolver) {
        PoseLandmarker  = ns.PoseLandmarker;
        FilesetResolver = ns.FilesetResolver;
        console.log("[pose] found MediaPipe API");
        break;
      }
    }

    // Deep scan of window properties if not found above
    if (!PoseLandmarker) {
      for (const key of Object.keys(window)) {
        const val = window[key];
        if (val && typeof val === "object" && val.PoseLandmarker && val.FilesetResolver) {
          PoseLandmarker  = val.PoseLandmarker;
          FilesetResolver = val.FilesetResolver;
          console.log("[pose] found MediaPipe API at window." + key);
          break;
        }
      }
    }

    if (!PoseLandmarker || !FilesetResolver) {
      throw new Error("MediaPipe API not found after CDN load. Check network connectivity.");
    }

    console.log("[pose] creating PoseLandmarker...");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    detector = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "IMAGE",
      numPoses: 3,
    });
    console.log("[pose] PoseLandmarker ready");
    return detector;
  })();

  return initPromise;
}

// --- Detect all poses on a canvas --------------------------------------------
export async function detectPoses(canvas) {
  const det = await initPoseDetector();
  // Tasks Vision IMAGE mode accepts HTMLCanvasElement directly
  const result = det.detect(canvas);
  const poses  = result?.landmarks || [];
  return poses;
}

// --- Pick pose closest to target (normalised coords) -------------------------
export function closestPose(poses, targetCx, targetCy) {
  if (!poses?.length) return null;
  let best = null, bestDist = Infinity;
  poses.forEach(landmarks => {
    const bb = getPoseBoundingBox(landmarks);
    if (!bb || bb.confidence < 0.3) return; // skip low-confidence detections
    const dist = Math.hypot(bb.cx - targetCx, bb.cy - targetCy);
    if (dist < bestDist) { bestDist = dist; best = { landmarks, bb }; }
  });
  return best;
}
