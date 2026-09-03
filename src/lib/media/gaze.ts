/**
 * Approximate gaze / eye-attention estimation from MediaPipe FaceLandmarker
 * landmarks. This is a coarse geometric approximation — NOT eye tracking, NOT
 * cheating detection. It runs entirely in the browser; no frame, crop, or
 * landmark ever leaves the device.
 *
 * All measurements are normalised against the eye opening itself, so the
 * result is largely independent of camera distance, face size and webcam
 * resolution.
 */
import {
  BLINK_EAR_THRESHOLD,
  GAZE_HORIZONTAL_LEFT,
  GAZE_HORIZONTAL_RIGHT,
  GAZE_SMOOTHING_MAJORITY,
  GAZE_VERTICAL_DOWN,
  GAZE_VERTICAL_UP,
} from "@/lib/interview/config";

export interface Landmark {
  x: number;
  y: number;
}

/** Coarse gaze direction, in image space (mirrored preview is irrelevant here). */
export type GazeDirection = "good" | "left" | "right" | "down" | "away" | "unknown";

export interface GazeSample {
  direction: GazeDirection;
  /** True when both eyes look closed — the caller should ignore the sample. */
  blinking: boolean;
  /** False when the landmarks were unusable for this frame. */
  valid: boolean;
}

/**
 * FaceLandmarker (face_landmarker.task) returns 478 points: the 468 face mesh
 * points plus 10 refined iris points. Indices below are the standard MediaPipe
 * face-mesh indices.
 */
interface EyeIndices {
  outer: number;
  inner: number;
  upper: number;
  lower: number;
  iris: number;
}

const EYES: { left: EyeIndices; right: EyeIndices } = {
  left: { outer: 33, inner: 133, upper: 159, lower: 145, iris: 468 },
  right: { outer: 263, inner: 362, upper: 386, lower: 374, iris: 473 },
};

interface EyeMetrics {
  /** 0 = outer corner side, 1 = inner corner side, ~0.5 = centred. */
  horizontal: number;
  /** 0 = upper lid, 1 = lower lid, ~0.5 = centred. */
  vertical: number;
  /** Eye-aspect ratio: lid opening relative to eye width. */
  ear: number;
}

function eyeMetrics(points: Landmark[], eye: EyeIndices): EyeMetrics | null {
  const outer = points[eye.outer];
  const inner = points[eye.inner];
  const upper = points[eye.upper];
  const lower = points[eye.lower];
  const iris = points[eye.iris];
  if (!outer || !inner || !upper || !lower || !iris) return null;

  const width = Math.abs(inner.x - outer.x);
  const height = Math.abs(lower.y - upper.y);
  if (width < 1e-6) return null;

  const minX = Math.min(outer.x, inner.x);
  const horizontal = (iris.x - minX) / width;

  const minY = Math.min(upper.y, lower.y);
  const vertical = height < 1e-6 ? 0.5 : (iris.y - minY) / height;

  return { horizontal, vertical, ear: height / width };
}

/**
 * Estimate the gaze direction for one detected face.
 * `headFacing` comes from head-orientation geometry and is used only as a
 * reliability gate: when the head is strongly turned, the iris offsets are no
 * longer meaningful and the sample is reported as "away" rather than guessed.
 */
export function estimateGaze(points: Landmark[], headFacing: boolean): GazeSample {
  const left = eyeMetrics(points, EYES.left);
  const right = eyeMetrics(points, EYES.right);
  const eyes = [left, right].filter((e): e is EyeMetrics => e !== null);
  if (eyes.length === 0) return { direction: "unknown", blinking: false, valid: false };

  // Blink / squint: ignore the sample entirely instead of guessing a direction.
  const openEyes = eyes.filter((e) => e.ear >= BLINK_EAR_THRESHOLD);
  if (openEyes.length === 0) return { direction: "unknown", blinking: true, valid: false };

  if (!headFacing) return { direction: "away", blinking: false, valid: true };

  const horizontal = openEyes.reduce((sum, e) => sum + e.horizontal, 0) / openEyes.length;
  const vertical = openEyes.reduce((sum, e) => sum + e.vertical, 0) / openEyes.length;

  if (vertical > GAZE_VERTICAL_DOWN) return { direction: "down", blinking: false, valid: true };
  if (vertical < GAZE_VERTICAL_UP) return { direction: "away", blinking: false, valid: true };
  if (horizontal < GAZE_HORIZONTAL_LEFT) return { direction: "left", blinking: false, valid: true };
  if (horizontal > GAZE_HORIZONTAL_RIGHT)
    return { direction: "right", blinking: false, valid: true };
  return { direction: "good", blinking: false, valid: true };
}

/**
 * Temporal smoothing: a direction only becomes the active state once a
 * majority of the recent samples agree. This absorbs blinks, quick glances
 * and single-frame landmark noise.
 */
export function smoothDirection(buffer: GazeDirection[], fallback: GazeDirection): GazeDirection {
  if (buffer.length === 0) return fallback;
  const counts = new Map<GazeDirection, number>();
  for (const d of buffer) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best: GazeDirection = fallback;
  let bestCount = 0;
  for (const [direction, count] of counts) {
    if (count > bestCount) {
      best = direction;
      bestCount = count;
    }
  }
  return bestCount >= GAZE_SMOOTHING_MAJORITY ? best : fallback;
}

export const isAttentive = (direction: GazeDirection): boolean => direction === "good";
