/**
 * Approximate gaze / attention estimation from MediaPipe FaceLandmarker
 * landmarks (face mesh + refined iris points).
 *
 * This is a coarse geometric approximation — NOT exact eye tracking, NOT
 * cheating, honesty, emotion or personality detection. Everything here runs
 * synchronously in the browser on landmark numbers only: no frame, crop,
 * screenshot, landmark array or coordinate ever leaves the device.
 *
 * Output is continuous, normalised and calibration-friendly:
 *   gazeX: -1 (candidate's left in image space) .. +1 (right)
 *   gazeY: -1 (up) .. +1 (down)
 *   head:  yaw / pitch / roll in normalised units around 0
 */
import {
  BLINK_EAR_THRESHOLD,
  EYE_DISAGREEMENT_LIMIT,
  GAZE_STRONG_X,
  GAZE_STRONG_Y,
  MIN_FACE_WIDTH,
} from "@/lib/interview/config";

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

/** Descriptive label derived from the continuous measurements (UI/metrics only). */
export type GazeDirection =
  | "center"
  | "slight-left"
  | "strong-left"
  | "slight-right"
  | "strong-right"
  | "slight-up"
  | "strong-up"
  | "slight-down"
  | "strong-down"
  | "upper-left"
  | "upper-right"
  | "lower-left"
  | "lower-right"
  | "unknown";

export interface GazeFrame {
  /** Continuous horizontal gaze, -1..1. */
  gazeX: number;
  /** Continuous vertical gaze, -1..1. */
  gazeY: number;
  head: HeadPose;
  /** 0..1 local confidence in this frame's measurements. */
  reliability: number;
  /** Both eyes appear closed on this frame. */
  blinking: boolean;
  /** Mean eye-aspect ratio (lid opening relative to eye width). */
  ear: number;
  /** False when the landmarks were unusable for this frame. */
  valid: boolean;
}

interface EyeIndices {
  outer: number;
  inner: number;
  upper: number;
  lower: number;
  iris: number;
}

/** Standard MediaPipe face-mesh indices; 468 / 473 are the refined iris centres. */
const EYES: { left: EyeIndices; right: EyeIndices } = {
  left: { outer: 33, inner: 133, upper: 159, lower: 145, iris: 468 },
  right: { outer: 263, inner: 362, upper: 386, lower: 374, iris: 473 },
};

const NOSE_TIP = 1;
const CHIN = 152;
const FOREHEAD = 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Iris offset within one eye opening, expressed as -1..1 on both axes.
 * The usable iris travel inside the eye opening is roughly the middle 40% of
 * the corner-to-corner span, so the raw ratio is re-scaled to fill -1..1.
 */
const H_SCALE = 4.0;
const V_SCALE = 3.2;

interface EyeMeasurement {
  x: number;
  y: number;
  ear: number;
}

function measureEye(points: Landmark[], eye: EyeIndices, mirrored: boolean): EyeMeasurement | null {
  const outer = points[eye.outer];
  const inner = points[eye.inner];
  const upper = points[eye.upper];
  const lower = points[eye.lower];
  const iris = points[eye.iris];
  if (!outer || !inner || !upper || !lower || !iris) return null;

  const width = Math.abs(inner.x - outer.x);
  const height = Math.abs(lower.y - upper.y);
  if (width < 1e-6) return null;

  const centreX = (inner.x + outer.x) / 2;
  const centreY = (upper.y + lower.y) / 2;

  // Normalised against the eye opening → independent of face size / camera distance.
  let x = clamp(((iris.x - centreX) / width) * H_SCALE, -1, 1);
  const y = clamp(((iris.y - centreY) / Math.max(height, 1e-6)) * V_SCALE, -1, 1);
  // The inner corner sits on opposite sides for the two eyes; normalise the sign.
  if (mirrored) x = -x;

  return { x, y, ear: height / width };
}

/** Approximate head pose from stable face-mesh geometry. */
function measureHead(points: Landmark[]): { pose: HeadPose; faceWidth: number } | null {
  const nose = points[NOSE_TIP];
  const leftEye = points[EYES.left.outer];
  const rightEye = points[EYES.right.outer];
  const chin = points[CHIN];
  const forehead = points[FOREHEAD];
  if (!nose || !leftEye || !rightEye) return null;

  const faceWidth = Math.abs(rightEye.x - leftEye.x);
  if (faceWidth < 1e-6) return null;

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;

  // Yaw: nose displacement from the eye midpoint, relative to face width.
  const yaw = clamp(((nose.x - eyeMidX) / faceWidth) * 4, -2, 2);

  // Pitch: nose height between eyes and chin, centred on a neutral ~0.45 ratio.
  const faceHeight = chin && forehead ? Math.abs(chin.y - forehead.y) : faceWidth * 1.6;
  const pitch = clamp(((nose.y - eyeMidY) / Math.max(faceHeight, 1e-6) - 0.28) * 4, -2, 2);

  // Roll: tilt of the inter-eye line.
  const roll = clamp(
    Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) / (Math.PI / 4),
    -2,
    2,
  );

  return { pose: { yaw, pitch, roll }, faceWidth };
}

/**
 * Measure one detected face. Both eyes are used whenever both are usable;
 * strong disagreement between them lowers reliability instead of producing a
 * confident (and probably wrong) direction.
 */
export function measureFace(points: Landmark[]): GazeFrame {
  const empty: GazeFrame = {
    gazeX: 0,
    gazeY: 0,
    head: { yaw: 0, pitch: 0, roll: 0 },
    reliability: 0,
    blinking: false,
    ear: 0,
    valid: false,
  };

  const head = measureHead(points);
  if (!head) return empty;

  const left = measureEye(points, EYES.left, false);
  const right = measureEye(points, EYES.right, true);
  const eyes = [left, right].filter((e): e is EyeMeasurement => e !== null);
  if (eyes.length === 0) {
    return { ...empty, head: head.pose, reliability: 0.15, valid: false };
  }

  const ear = eyes.reduce((s, e) => s + e.ear, 0) / eyes.length;
  const open = eyes.filter((e) => e.ear >= BLINK_EAR_THRESHOLD);
  if (open.length === 0) {
    return { ...empty, head: head.pose, ear, reliability: 0.2, blinking: true, valid: false };
  }

  const gazeX = open.reduce((s, e) => s + e.x, 0) / open.length;
  const gazeY = open.reduce((s, e) => s + e.y, 0) / open.length;

  // ---- Reliability -------------------------------------------------------
  let reliability = 1;
  // Both eyes usable is the best case.
  if (open.length < 2) reliability -= 0.3;
  // Eyes disagreeing strongly means the iris estimate is not trustworthy.
  if (left && right) {
    const disagreement = Math.abs(left.x - right.x) + Math.abs(left.y - right.y) * 0.5;
    if (disagreement > EYE_DISAGREEMENT_LIMIT) reliability -= 0.45;
    else reliability -= (disagreement / EYE_DISAGREEMENT_LIMIT) * 0.2;
  }
  // Face too small / too far for reliable iris geometry.
  if (head.faceWidth < MIN_FACE_WIDTH) reliability -= 0.4;
  // Face partially outside the frame.
  const outside = points.some(
    (p, i) => i < 468 && (p.x < -0.02 || p.x > 1.02 || p.y < -0.02 || p.y > 1.02),
  );
  if (outside) reliability -= 0.3;
  // Squinting / half-closed lids degrade the iris centre.
  if (ear < BLINK_EAR_THRESHOLD * 1.4) reliability -= 0.25;
  // Extreme head rotation makes the 2D iris offset ambiguous.
  if (Math.abs(head.pose.yaw) > 1.1 || Math.abs(head.pose.pitch) > 1.1) reliability -= 0.3;

  return {
    gazeX,
    gazeY,
    head: head.pose,
    reliability: clamp(reliability, 0, 1),
    blinking: false,
    ear,
    valid: true,
  };
}

/** Exponential moving average used for temporal smoothing. */
export function ema(previous: number | null, next: number, alpha: number): number {
  return previous === null ? next : previous + alpha * (next - previous);
}

/** Descriptive label from the continuous, calibration-corrected coordinates. */
export function describeGaze(
  gazeX: number,
  gazeY: number,
  toleranceX: number,
  toleranceY: number,
): GazeDirection {
  const horizontal = Math.abs(gazeX) > toleranceX;
  const vertical = Math.abs(gazeY) > toleranceY;

  if (!horizontal && !vertical) return "center";
  if (horizontal && vertical) {
    if (gazeY < 0) return gazeX < 0 ? "upper-left" : "upper-right";
    return gazeX < 0 ? "lower-left" : "lower-right";
  }
  if (horizontal) {
    const strong = Math.abs(gazeX) >= GAZE_STRONG_X;
    if (gazeX < 0) return strong ? "strong-left" : "slight-left";
    return strong ? "strong-right" : "slight-right";
  }
  const strong = Math.abs(gazeY) >= GAZE_STRONG_Y;
  if (gazeY < 0) return strong ? "strong-up" : "slight-up";
  return strong ? "strong-down" : "slight-down";
}

export const isTowardCamera = (direction: GazeDirection): boolean => direction === "center";
