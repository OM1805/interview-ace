import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTENTION_WARNINGS,
  GAZE_GRACE_MS,
  GAZE_RECOVERY_MS,
  GAZE_SMOOTHING_SAMPLES,
  LOOK_AWAY_GRACE_MS,
  NO_FACE_GRACE_MS,
  WARNING_COOLDOWN_MS,
} from "@/lib/interview/config";
import {
  estimateGaze,
  isAttentive,
  smoothDirection,
  type GazeDirection,
  type Landmark,
} from "./gaze";

export type FaceStatus = "loading" | "unavailable" | "none" | "one" | "multiple";
export type EngagementStatus = "unknown" | "facing" | "away";
export type GazeStatus = "unavailable" | GazeDirection;

export interface CameraStats {
  /** Total monitored samples (one per detection tick). */
  samples: number;
  /** Samples where the head was oriented toward the camera. */
  facingSamples: number;
  /** Samples where a usable gaze estimate was produced. */
  gazeSamples: number;
  /** Gaze samples classified as acceptable attention. */
  attentiveSamples: number;
  /** Warnings raised by face presence / head orientation monitoring. */
  faceWarnings: number;
  /** Distinct sustained attention-away events. */
  attentionWarnings: number;
  /** Total informational warnings shown. */
  warnings: number;
}

const emptyStats = (): CameraStats => ({
  samples: 0,
  facingSamples: 0,
  gazeSamples: 0,
  attentiveSamples: 0,
  faceWarnings: 0,
  attentionWarnings: 0,
  warnings: 0,
});

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Approximate head orientation from eye/nose landmark geometry. */
function isFacingCamera(landmarks: Landmark[]): boolean {
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  if (!nose || !leftEye || !rightEye) return true;
  const dLeft = Math.abs(nose.x - leftEye.x);
  const dRight = Math.abs(nose.x - rightEye.x);
  if (dLeft === 0 || dRight === 0) return false;
  const ratio = dLeft / dRight;
  const yawOk = ratio > 0.45 && ratio < 2.2;

  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const faceWidth = Math.abs(rightEye.x - leftEye.x) || 0.001;
  const pitch = (nose.y - eyeMidY) / faceWidth;
  const pitchOk = pitch > -0.25 && pitch < 1.1;
  return yawOk && pitchOk;
}

/**
 * Camera monitoring: face presence, face count, head/camera engagement and
 * approximate gaze attention. No identification, no emotion/personality
 * inference, no cheating judgement. All processing stays in the browser.
 */
export function useFaceMonitor(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onWarning: (message: string) => void,
) {
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("loading");
  const [engagement, setEngagement] = useState<EngagementStatus>("unknown");
  const [gaze, setGaze] = useState<GazeStatus>("unknown");
  const statsRef = useRef<CameraStats>(emptyStats());
  const [stats, setStats] = useState<CameraStats>(statsRef.current);

  const warnRef = useRef(onWarning);
  warnRef.current = onWarning;

  const lastFacingAt = useRef(Date.now());
  const lastFaceAt = useRef(Date.now());
  const lastWarnAt = useRef<Record<string, number>>({});

  // Gaze temporal state.
  const gazeBuffer = useRef<GazeDirection[]>([]);
  const gazeState = useRef<GazeDirection>("unknown");
  const awaySince = useRef<number | null>(null);
  const attentiveSince = useRef<number | null>(null);
  const awayEventActive = useRef(false);
  const gazeUsable = useRef(false);

  /** Cooldown-gated warning emitter. Purely informational — never blocking. */
  const emit = useCallback((key: string, message: string, kind: "face" | "attention") => {
    const now = Date.now();
    if (now - (lastWarnAt.current[key] ?? 0) < WARNING_COOLDOWN_MS) return;
    lastWarnAt.current[key] = now;
    if (kind === "face") statsRef.current.faceWarnings += 1;
    statsRef.current.warnings += 1;
    setStats({ ...statsRef.current });
    warnRef.current(message);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let landmarker: any = null;

    const resetGaze = () => {
      gazeBuffer.current = [];
      gazeState.current = "unknown";
      awaySince.current = null;
      attentiveSince.current = null;
      awayEventActive.current = false;
    };

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 2,
        });
        if (cancelled) {
          landmarker.close?.();
          return;
        }
        setFaceStatus("none");
        setGaze("unknown");
        lastFaceAt.current = Date.now();
        lastFacingAt.current = Date.now();
        resetGaze();

        timer = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || video.videoWidth === 0) return;
          let result;
          try {
            result = landmarker.detectForVideo(video, performance.now());
          } catch {
            return;
          }
          const faces: Landmark[][] = result?.faceLandmarks ?? [];
          const now = Date.now();
          statsRef.current.samples += 1;

          if (faces.length === 0) {
            setFaceStatus("none");
            setEngagement("unknown");
            setGaze("unknown");
            resetGaze();
            if (now - lastFaceAt.current > NO_FACE_GRACE_MS) {
              emit("noface", "No face detected. Please return to the camera.", "face");
            }
          } else if (faces.length > 1) {
            setFaceStatus("multiple");
            setGaze("unknown");
            resetGaze();
            lastFaceAt.current = now;
            emit("multi", "Multiple faces detected. Please ensure only you are visible.", "face");
          } else {
            const points = faces[0]!;
            setFaceStatus("one");
            lastFaceAt.current = now;

            // ---- Head / camera engagement (unchanged behaviour) ----
            const facing = isFacingCamera(points);
            setEngagement(facing ? "facing" : "away");
            if (facing) {
              lastFacingAt.current = now;
              statsRef.current.facingSamples += 1;
            } else if (now - lastFacingAt.current > LOOK_AWAY_GRACE_MS) {
              emit("away", "Please face the camera.", "face");
            }

            // ---- Gaze / attention monitoring (eye-region landmarks) ----
            const sample = estimateGaze(points, facing);
            if (!sample.valid) {
              // Blink or unusable landmarks: keep the last stable state, no warning.
              if (!gazeUsable.current && !sample.blinking) setGaze("unavailable");
            } else {
              gazeUsable.current = true;
              gazeBuffer.current.push(sample.direction);
              if (gazeBuffer.current.length > GAZE_SMOOTHING_SAMPLES) gazeBuffer.current.shift();
              const smoothed = smoothDirection(gazeBuffer.current, gazeState.current);
              gazeState.current = smoothed;
              setGaze(smoothed);

              statsRef.current.gazeSamples += 1;
              if (isAttentive(smoothed)) statsRef.current.attentiveSamples += 1;

              if (isAttentive(smoothed)) {
                // Sustained recovery closes the current attention-away event.
                attentiveSince.current ??= now;
                if (now - attentiveSince.current >= GAZE_RECOVERY_MS) {
                  awaySince.current = null;
                  awayEventActive.current = false;
                }
              } else if (smoothed !== "unknown") {
                attentiveSince.current = null;
                awaySince.current ??= now;
                // One continuous attention-away period = one distinct event.
                if (!awayEventActive.current && now - awaySince.current > GAZE_GRACE_MS) {
                  awayEventActive.current = true;
                  statsRef.current.attentionWarnings += 1;
                  const level = Math.min(statsRef.current.attentionWarnings, ATTENTION_WARNINGS.length);
                  emit("attention", ATTENTION_WARNINGS[level - 1]!, "attention");
                }
              }
            }
          }
          if (statsRef.current.samples % 5 === 0) setStats({ ...statsRef.current });
        }, 250);
      } catch {
        if (!cancelled) {
          setFaceStatus("unavailable");
          setGaze("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      landmarker?.close?.();
    };
  }, [active, videoRef, emit]);

  return { faceStatus, engagement, gaze, stats };
}
