// --- MediaPipe Pose for swimming analysis ------------------------------------
// Uses @mediapipe/tasks-vision via CDN
// The bundle exposes everything under window.mpTasksVision (tasks-vision 0.10.x)

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
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI);
}

// Get bounding box of a pose in normalised 0-1 coords
export function getPoseBoundingBox(landmarks, padding = 0.12) {
  const visible = landmarks.filter(l => l.visibility > 0.3);
  if (visible.length < 4) return null;
  const xs = visible.map(l => l.x);
  const ys = visible.map(l => l.y);
  const minX = Math.max(0, Math.min(...xs) - padding);
  const maxX = Math.min(1, Math.max(...xs) + padding);
  const minY = Math.max(0, Math.min(...ys) - padding);
  const maxY = Math.min(1, Math.max(...ys) + padding);
  return {
    x: minX, y: minY,
    w: maxX - minX, h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function getStrokeAngles(stroke, lm) {
  const angles = [];
  const add = (label, a, b, c) => {
    const pa = lm[a], pb = lm[b], pc = lm[c];
    if (!pa || !pb || !pc) return;
    if ((pa.visibility||0) < 0.4 || (pb.visibility||0) < 0.4 || (pc.visibility||0) < 0.4) return;
    const deg = angleBetween(pa, pb, pc);
    if (deg !== null) angles.push({ label, deg, x: pb.x, y: pb.y });
  };

  // Body line
  const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
  if (ls && rs && (ls.visibility||0) > 0.4 && (rs.visibility||0) > 0.4) {
    const bodyAngle = Math.abs(Math.round(
      Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI
    ));
    angles.push({ label: "body", deg: bodyAngle, x: (ls.x + rs.x) / 2, y: Math.min(ls.y, rs.y) - 0.06 });
  }

  if (stroke === "Freestyle" || stroke === "Backstroke") {
    add("L-elbow",    LM.LEFT_SHOULDER,  LM.LEFT_ELBOW,    LM.LEFT_WRIST);
    add("R-elbow",    LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW,   LM.RIGHT_WRIST);
    add("L-shoulder", LM.LEFT_ELBOW,     LM.LEFT_SHOULDER, LM.LEFT_HIP);
    add("R-shoulder", LM.RIGHT_ELBOW,    LM.RIGHT_SHOULDER,LM.RIGHT_HIP);
    const lh = lm[LM.LEFT_HIP], rh = lm[LM.RIGHT_HIP];
    if (lh && rh && (lh.visibility||0) > 0.4 && (rh.visibility||0) > 0.4) {
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
    add("L-elbow", LM.LEFT_SHOULDER, LM.LEFT_ELBOW,  LM.LEFT_WRIST);
    add("R-elbow", LM.RIGHT_SHOULDER,LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
    add("L-hip",   LM.LEFT_SHOULDER, LM.LEFT_HIP,    LM.LEFT_KNEE);
    add("R-hip",   LM.RIGHT_SHOULDER,LM.RIGHT_HIP,   LM.RIGHT_KNEE);
  }
  return angles;
}

export function drawPoseOverlay(ctx, landmarks, W, H, stroke) {
  if (!landmarks || landmarks.length === 0) return [];

  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  SKELETON.forEach(([a, b]) => {
    const la = landmarks[a], lb = landmarks[b];
    if (!la || !lb || (la.visibility||0) < 0.3 || (lb.visibility||0) < 0.3) return;
    ctx.beginPath();
    ctx.moveTo(la.x * W, la.y * H);
    ctx.lineTo(lb.x * W, lb.y * H);
    ctx.stroke();
  });

  Object.values(LM).forEach(idx => {
    const l = landmarks[idx];
    if (!l || (l.visibility||0) < 0.3) return;
    ctx.fillStyle = (l.visibility||0) > 0.7 ? "#FFFFFF" : "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(l.x * W, l.y * H, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  const angles = getStrokeAngles(stroke, landmarks);
  ctx.font = "bold 11px sans-serif";
  angles.forEach(({ label, deg, x, y }) => {
    const px = x * W, py = Math.max(14, y * H - 16);
    const text = `${label} ${deg}`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "#E63946";
    ctx.fillRect(px - tw / 2 - 5, py - 12, tw + 10, 16);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(text, px, py);
    ctx.textAlign = "left";
  });

  return angles;
}

// --- Lazy-load MediaPipe via CDN ---------------------------------------------
let detector   = null;
let initPromise = null;

export async function initPoseDetector() {
  if (detector) return detector;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Load the bundle if not already present
    if (!window.mpTasksVision) {
      console.log("[pose] loading MediaPipe CDN...");
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        // IIFE bundle -- puts exports on window.mpTasksVision
        s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js";
        s.crossOrigin = "anonymous";
        s.onload = () => {
          console.log("[pose] script loaded, window keys with mediapipe:",
            Object.keys(window).filter(k => k.toLowerCase().includes("mediapipe") || k.toLowerCase().includes("mptasks") || k.toLowerCase().includes("vision")).join(", ") || "none found"
          );
          res();
        };
        s.onerror = () => rej(new Error("MediaPipe CDN load failed -- check network"));
        document.head.appendChild(s);
      });
      await new Promise(r => setTimeout(r, 200));
    }

    // The IIFE bundle from @mediapipe/tasks-vision puts classes directly on window
    // Try the known possible global locations in order
    const api = window.mediapipeTasks
      || window.mpTasksVision
      || window.mediapipeTasksVision
      || window;

    let PoseLandmarker  = api.PoseLandmarker;
    let FilesetResolver = api.FilesetResolver;

    // Last resort -- scan window for PoseLandmarker
    if (!PoseLandmarker) {
      for (const key of Object.keys(window)) {
        if (window[key] && typeof window[key] === "object") {
          if (window[key].PoseLandmarker) {
            PoseLandmarker  = window[key].PoseLandmarker;
            FilesetResolver = window[key].FilesetResolver;
            console.log("[pose] found API under window." + key);
            break;
          }
        }
        if (window[key]?.name === "PoseLandmarker" || (typeof window[key] === "function" && String(window[key]).includes("PoseLandmarker"))) {
          PoseLandmarker = window[key];
          console.log("[pose] found PoseLandmarker directly on window." + key);
        }
      }
    }

    if (!PoseLandmarker || !FilesetResolver) {
      const allKeys = Object.keys(window).filter(k => !["caches","frames","history","location","navigator","document","performance"].includes(k)).slice(0, 30);
      throw new Error(`MediaPipe API not found. Window keys: ${allKeys.join(", ")}`);
    }

    console.log("[pose] creating PoseLandmarker...");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    detector = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "IMAGE",
      numPoses: 3,
    });
    console.log("[pose] PoseLandmarker ready");
    return detector;
  })();

  return initPromise;
}

// --- Run pose detection on a canvas element ----------------------------------
// The Tasks Vision API requires an HTMLImageElement or ImageData, not canvas.
// We convert canvas -> ImageData for detection.
export async function detectPoses(canvas) {
  try {
    const det = await initPoseDetector();
    // Convert canvas to ImageData for Tasks Vision API
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = det.detect(imageData);
    const poses = result?.landmarks || [];
    console.log(`[pose] detected ${poses.length} pose(s)`);
    return poses;
  } catch (e) {
    console.error("[pose] detectPoses failed:", e.message);
    return [];
  }
}

// --- Pick pose closest to target centre (normalised 0-1) ---------------------
export function closestPose(poses, targetCx, targetCy) {
  if (!poses || poses.length === 0) return null;
  let best = null, bestDist = Infinity;
  poses.forEach(landmarks => {
    const bb = getPoseBoundingBox(landmarks);
    if (!bb) return;
    const dist = Math.hypot(bb.cx - targetCx, bb.cy - targetCy);
    if (dist < bestDist) { bestDist = dist; best = { landmarks, bb }; }
  });
  return best;
}
