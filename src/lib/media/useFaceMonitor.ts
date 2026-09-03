import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOOK_AWAY_GRACE_MS,
  NO_FACE_GRACE_MS,
  WARNING_COOLDOWN_MS,
} from "@/lib/interview/config";

export type FaceStatus = "loading" | "unavailable" | "none" | "one" | "multiple";
export type EngagementStatus = "unknown" | "facing" | "away";

export interface CameraStats {
  samples: number;
  facingSamples: number;
  warnings: number;
}

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface Landmark {
  x: number;
  y: number;
}

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
 * Face presence + approximate "camera engagement" monitoring with MediaPipe.
 * No identification, no emotion/personality inference — presence, face count
 * and rough head orientation only. All processing stays in the browser.
 */
export function useFaceMonitor(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onWarning: (message: string) => void,
) {
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("loading");
  const [engagement, setEngagement] = useState<EngagementStatus>("unknown");
  const statsRef = useRef<CameraStats>({ samples: 0, facingSamples: 0, warnings: 0 });
  const [stats, setStats] = useState<CameraStats>(statsRef.current);

  const warnRef = useRef(onWarning);
  warnRef.current = onWarning;

  const lastFacingAt = useRef(Date.now());
  const lastFaceAt = useRef(Date.now());
  const lastWarnAt = useRef<Record<string, number>>({});

  const emit = useCallback((key: string, message: string) => {
    const now = Date.now();
    if (now - (lastWarnAt.current[key] ?? 0) < WARNING_COOLDOWN_MS) return;
    lastWarnAt.current[key] = now;
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
        lastFaceAt.current = Date.now();
        lastFacingAt.current = Date.now();

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
            if (now - lastFaceAt.current > NO_FACE_GRACE_MS) {
              emit("noface", "No face detected. Please return to the camera.");
            }
          } else if (faces.length > 1) {
            setFaceStatus("multiple");
            lastFaceAt.current = now;
            emit("multi", "Multiple faces detected. Please ensure only you are visible.");
          } else {
            setFaceStatus("one");
            lastFaceAt.current = now;
            const facing = isFacingCamera(faces[0]!);
            setEngagement(facing ? "facing" : "away");
            if (facing) {
              lastFacingAt.current = now;
              statsRef.current.facingSamples += 1;
            } else if (now - lastFacingAt.current > LOOK_AWAY_GRACE_MS) {
              emit("away", "Please face the camera.");
            }
          }
          if (statsRef.current.samples % 5 === 0) setStats({ ...statsRef.current });
        }, 250);
      } catch {
        if (!cancelled) setFaceStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      landmarker?.close?.();
    };
  }, [active, videoRef, emit]);

  return { faceStatus, engagement, stats };
}
