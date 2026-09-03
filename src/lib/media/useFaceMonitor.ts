import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTENTION_WARNINGS,
  AWAY_GRACE_MS,
  CALIBRATION_DURATION_MS,
  CALIBRATION_MIN_SAMPLES,
  EXTENDED_CLOSURE_THRESHOLD_MS,
  GAZE_TOLERANCE_X,
  GAZE_TOLERANCE_Y,
  HEAD_PITCH_TOLERANCE,
  HEAD_YAW_TOLERANCE,
  LOOK_AWAY_GRACE_MS,
  MONITOR_INTERVAL_MS,
  NO_FACE_GRACE_MS,
  RAPID_GAZE_THRESHOLD,
  RAPID_SHIFT_REPEAT_COUNT,
  RAPID_SHIFT_WINDOW_MS,
  RECOVERY_MS,
  RELIABILITY_THRESHOLD,
  SMOOTHING_ALPHA,
  WARNING_COOLDOWN_MS,
  WARNING_DECAY_MS,
} from "@/lib/interview/config";
import {
  describeGaze,
  ema,
  isTowardCamera,
  measureFace,
  type GazeDirection,
  type Landmark,
} from "./gaze";

export type FaceStatus = "loading" | "unavailable" | "none" | "one" | "multiple";
export type EngagementStatus = "unknown" | "facing" | "away";
/** High-level attention state shown to the candidate. */
export type AttentionState =
  | "unavailable"
  | "calibrating"
  | "uncertain"
  | "toward-camera"
  | "away"
  | "no-face"
  | "multiple-faces";
export type WarningLevel = 0 | 1 | 2;

/** Local, numerical monitoring metrics. Never an honesty/confidence/cheating score. */
export interface CameraStats {
  /** Total monitored samples (one per detection tick). */
  samples: number;
  /** Samples where the head was oriented toward the camera. */
  facingSamples: number;
  /** Total monitored time (ms). */
  monitoredMs: number;
  /** Time with a reliable measurement (ms). */
  validMs: number;
  /** Time classified as camera-directed attention (ms). */
  attentionMs: number;
  /** Time classified as attention-away (ms). */
  awayMs: number;
  /** Time where tracking was too unreliable to classify (ms). */
  uncertainMs: number;
  /** Distinct sustained attention-away events. */
  attentionAwayEvents: number;
  /** Longest continuous attention-away period (ms). */
  longestAwayMs: number;
  /** Level 1 / level 2 warning events. */
  warning1Count: number;
  warning2Count: number;
  blinkCount: number;
  extendedClosureEvents: number;
  rapidShiftCount: number;
  repeatedShiftEvents: number;
  noFaceEvents: number;
  multipleFaceEvents: number;
  /** Warnings raised by face presence / head orientation monitoring. */
  faceWarnings: number;
  /** Total informational warnings shown. */
  warnings: number;
}

const emptyStats = (): CameraStats => ({
  samples: 0,
  facingSamples: 0,
  monitoredMs: 0,
  validMs: 0,
  attentionMs: 0,
  awayMs: 0,
  uncertainMs: 0,
  attentionAwayEvents: 0,
  longestAwayMs: 0,
  warning1Count: 0,
  warning2Count: 0,
  blinkCount: 0,
  extendedClosureEvents: 0,
  rapidShiftCount: 0,
  repeatedShiftEvents: 0,
  noFaceEvents: 0,
  multipleFaceEvents: 0,
  faceWarnings: 0,
  warnings: 0,
});

interface Baseline {
  gazeX: number;
  gazeY: number;
  yaw: number;
  pitch: number;
  roll: number;
}

const zeroBaseline = (): Baseline => ({ gazeX: 0, gazeY: 0, yaw: 0, pitch: 0, roll: 0 });

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/**
 * Local camera monitoring: face presence/count, approximate head pose,
 * continuous 2D gaze estimation, temporal behaviour tracking and two
 * non-blocking warning levels. No identification, no emotion/personality
 * inference, no cheating judgement, and nothing leaves the browser.
 */
export function useFaceMonitor(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onWarning: (message: string) => void,
) {
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("loading");
  const [engagement, setEngagement] = useState<EngagementStatus>("unknown");
  const [attentionState, setAttentionState] = useState<AttentionState>("calibrating");
  const [gazeDirection, setGazeDirection] = useState<GazeDirection>("unknown");
  const [warningLevel, setWarningLevel] = useState<WarningLevel>(0);
  const [calibrated, setCalibrated] = useState(false);

  const statsRef = useRef<CameraStats>(emptyStats());
  const [stats, setStats] = useState<CameraStats>(statsRef.current);

  const warnRef = useRef(onWarning);
  warnRef.current = onWarning;

  // ---- Rapidly changing internal measurements live in refs (no re-render) ----
  const smoothX = useRef<number | null>(null);
  const smoothY = useRef<number | null>(null);
  const smoothYaw = useRef<number | null>(null);
  const smoothPitch = useRef<number | null>(null);
  const smoothRoll = useRef<number | null>(null);
  const smoothReliability = useRef<number | null>(null);

  const baseline = useRef<Baseline>(zeroBaseline());
  const calibrationSamples = useRef<Baseline[]>([]);
  const calibrationStart = useRef<number | null>(null);
  const calibratedRef = useRef(false);

  const lastTick = useRef<number>(Date.now());
  const lastFaceAt = useRef(Date.now());
  const lastFacingAt = useRef(Date.now());
  const lastWarnAt = useRef<Record<string, number>>({});

  const awaySince = useRef<number | null>(null);
  const attentiveSince = useRef<number | null>(null);
  const awayEventActive = useRef(false);
  const currentAwayMs = useRef(0);
  const warningLevelRef = useRef<WarningLevel>(0);

  const eyesClosedSince = useRef<number | null>(null);
  const closureCounted = useRef(false);
  const rapidShiftTimes = useRef<number[]>([]);
  const repeatedShiftActive = useRef(false);
  const faceMissing = useRef(false);
  const multiFaceActive = useRef(false);

  const publish = useCallback(() => setStats({ ...statsRef.current }), []);

  /** Cooldown-gated warning emitter. Purely informational — never blocking. */
  const emit = useCallback(
    (key: string, message: string, kind: "face" | "attention") => {
      const now = Date.now();
      if (now - (lastWarnAt.current[key] ?? 0) < WARNING_COOLDOWN_MS) return false;
      lastWarnAt.current[key] = now;
      if (kind === "face") statsRef.current.faceWarnings += 1;
      statsRef.current.warnings += 1;
      publish();
      warnRef.current(message);
      return true;
    },
    [publish],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let landmarker: any = null;

    // Full reset: every interview run / restart starts from clean metrics.
    statsRef.current = emptyStats();
    setStats(statsRef.current);
    smoothX.current = null;
    smoothY.current = null;
    smoothYaw.current = null;
    smoothPitch.current = null;
    smoothRoll.current = null;
    smoothReliability.current = null;
    baseline.current = zeroBaseline();
    calibrationSamples.current = [];
    calibrationStart.current = null;
    calibratedRef.current = false;
    awaySince.current = null;
    attentiveSince.current = null;
    awayEventActive.current = false;
    currentAwayMs.current = 0;
    warningLevelRef.current = 0;
    eyesClosedSince.current = null;
    closureCounted.current = false;
    rapidShiftTimes.current = [];
    repeatedShiftActive.current = false;
    faceMissing.current = false;
    multiFaceActive.current = false;
    lastWarnAt.current = {};
    setWarningLevel(0);
    setCalibrated(false);
    setAttentionState("calibrating");
    setGazeDirection("unknown");
    setEngagement("unknown");

    const setLevel = (level: WarningLevel) => {
      if (warningLevelRef.current === level) return;
      warningLevelRef.current = level;
      setWarningLevel(level);
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
        const now = Date.now();
        lastTick.current = now;
        lastFaceAt.current = now;
        lastFacingAt.current = now;

        timer = setInterval(() => {
          const video = videoRef.current;
          const now = Date.now();
          const dt = Math.min(now - lastTick.current, MONITOR_INTERVAL_MS * 5);
          lastTick.current = now;
          if (!video || video.readyState < 2 || video.videoWidth === 0) return;

          let result;
          try {
            result = landmarker.detectForVideo(video, performance.now());
          } catch {
            return;
          }
          const faces: Landmark[][] = result?.faceLandmarks ?? [];
          const s = statsRef.current;
          s.samples += 1;
          s.monitoredMs += dt;

          // ---------- Face presence ----------
          if (faces.length === 0) {
            setFaceStatus("none");
            setEngagement("unknown");
            setAttentionState("no-face");
            setGazeDirection("unknown");
            s.uncertainMs += dt;
            multiFaceActive.current = false;
            if (!faceMissing.current) {
              faceMissing.current = true;
              s.noFaceEvents += 1;
            }
            if (now - lastFaceAt.current > NO_FACE_GRACE_MS) {
              emit("noface", "No face detected. Please return to the camera.", "face");
            }
            if (s.samples % 5 === 0) publish();
            return;
          }

          faceMissing.current = false;

          if (faces.length > 1) {
            setFaceStatus("multiple");
            setAttentionState("multiple-faces");
            setGazeDirection("unknown");
            lastFaceAt.current = now;
            s.uncertainMs += dt;
            if (!multiFaceActive.current) {
              multiFaceActive.current = true;
              s.multipleFaceEvents += 1;
            }
            emit("multi", "Multiple faces detected. Please ensure only you are visible.", "face");
            if (s.samples % 5 === 0) publish();
            return;
          }

          multiFaceActive.current = false;
          setFaceStatus("one");
          lastFaceAt.current = now;

          // ---------- Measurement ----------
          const frame = measureFace(faces[0]!);

          // Blink / extended closure (never a warning source).
          if (frame.blinking) {
            if (eyesClosedSince.current === null) {
              eyesClosedSince.current = now;
              closureCounted.current = false;
              s.blinkCount += 1;
            } else if (
              !closureCounted.current &&
              now - eyesClosedSince.current > EXTENDED_CLOSURE_THRESHOLD_MS
            ) {
              closureCounted.current = true;
              s.extendedClosureEvents += 1;
            }
          } else {
            eyesClosedSince.current = null;
            closureCounted.current = false;
          }

          // Head engagement (existing behaviour, now from head pose).
          const rawYaw = frame.head.yaw;
          const rawPitch = frame.head.pitch;
          const facing =
            Math.abs(rawYaw - baseline.current.yaw) <= HEAD_YAW_TOLERANCE &&
            Math.abs(rawPitch - baseline.current.pitch) <= HEAD_PITCH_TOLERANCE;
          setEngagement(facing ? "facing" : "away");
          if (facing) {
            lastFacingAt.current = now;
            s.facingSamples += 1;
          } else if (now - lastFacingAt.current > LOOK_AWAY_GRACE_MS) {
            emit("head", "Please face the camera.", "face");
          }

          if (!frame.valid) {
            // Blink or unusable landmarks: hold the last stable state, no warning.
            s.uncertainMs += dt;
            if (!frame.blinking) setAttentionState("uncertain");
            if (s.samples % 5 === 0) publish();
            return;
          }

          // ---------- Temporal smoothing (EMA) ----------
          const prevX = smoothX.current;
          const prevY = smoothY.current;
          smoothX.current = ema(prevX, frame.gazeX, SMOOTHING_ALPHA);
          smoothY.current = ema(prevY, frame.gazeY, SMOOTHING_ALPHA);
          smoothYaw.current = ema(smoothYaw.current, rawYaw, SMOOTHING_ALPHA);
          smoothPitch.current = ema(smoothPitch.current, rawPitch, SMOOTHING_ALPHA);
          smoothRoll.current = ema(smoothRoll.current, frame.head.roll, SMOOTHING_ALPHA);
          smoothReliability.current = ema(smoothReliability.current, frame.reliability, 0.25);

          // ---------- Rapid gaze shift ----------
          if (prevX !== null && prevY !== null && dt > 0) {
            const dx = smoothX.current - prevX;
            const dy = smoothY.current - prevY;
            const speed = (Math.hypot(dx, dy) / dt) * 1000;
            if (speed > RAPID_GAZE_THRESHOLD) {
              s.rapidShiftCount += 1;
              rapidShiftTimes.current.push(now);
            }
          }
          rapidShiftTimes.current = rapidShiftTimes.current.filter(
            (t) => now - t <= RAPID_SHIFT_WINDOW_MS,
          );
          if (rapidShiftTimes.current.length >= RAPID_SHIFT_REPEAT_COUNT) {
            if (!repeatedShiftActive.current) {
              repeatedShiftActive.current = true;
              s.repeatedShiftEvents += 1;
            }
          } else {
            repeatedShiftActive.current = false;
          }

          // ---------- Calibration (local, temporary) ----------
          if (!calibratedRef.current) {
            calibrationStart.current ??= now;
            if (frame.reliability >= RELIABILITY_THRESHOLD) {
              calibrationSamples.current.push({
                gazeX: frame.gazeX,
                gazeY: frame.gazeY,
                yaw: rawYaw,
                pitch: rawPitch,
                roll: frame.head.roll,
              });
            }
            setAttentionState("calibrating");
            if (now - calibrationStart.current >= CALIBRATION_DURATION_MS) {
              const list = calibrationSamples.current;
              if (list.length >= CALIBRATION_MIN_SAMPLES) {
                const mean = (pick: (b: Baseline) => number) =>
                  list.reduce((sum, b) => sum + pick(b), 0) / list.length;
                baseline.current = {
                  gazeX: mean((b) => b.gazeX),
                  gazeY: mean((b) => b.gazeY),
                  yaw: mean((b) => b.yaw),
                  pitch: mean((b) => b.pitch),
                  roll: mean((b) => b.roll),
                };
                setCalibrated(true);
              } else {
                // Calibration failed: fall back to default neutral thresholds.
                baseline.current = zeroBaseline();
                setCalibrated(false);
                emit(
                  "calib",
                  "Attention calibration was not reliable. Monitoring continues with default settings.",
                  "face",
                );
              }
              calibratedRef.current = true;
              calibrationSamples.current = [];
              attentiveSince.current = now;
            }
            if (s.samples % 5 === 0) publish();
            return;
          }

          // ---------- Calibrated, continuous attention decision ----------
          const gx = smoothX.current - baseline.current.gazeX;
          const gy = smoothY.current - baseline.current.gazeY;
          const yawOffset = (smoothYaw.current ?? 0) - baseline.current.yaw;
          const pitchOffset = (smoothPitch.current ?? 0) - baseline.current.pitch;
          const reliability = smoothReliability.current ?? 0;

          const direction = describeGaze(gx, gy, GAZE_TOLERANCE_X, GAZE_TOLERANCE_Y);
          setGazeDirection(direction);

          if (reliability < RELIABILITY_THRESHOLD) {
            // Poor tracking never produces a gaze warning.
            s.uncertainMs += dt;
            setAttentionState("uncertain");
            awaySince.current = null;
            currentAwayMs.current = 0;
            if (s.samples % 5 === 0) publish();
            return;
          }

          s.validMs += dt;
          const headOk =
            Math.abs(yawOffset) <= HEAD_YAW_TOLERANCE &&
            Math.abs(pitchOffset) <= HEAD_PITCH_TOLERANCE;
          // Attention combines eyes and head: eyes toward camera while the head
          // is strongly turned is still counted as away, and vice versa.
          const attentive = isTowardCamera(direction) && headOk;

          if (attentive) {
            s.attentionMs += dt;
            setAttentionState("toward-camera");
            attentiveSince.current ??= now;
            awaySince.current = null;
            currentAwayMs.current = 0;
            const stableFor = now - attentiveSince.current;
            if (stableFor >= RECOVERY_MS) awayEventActive.current = false;
            // Warning highlight recovers naturally after sustained attention.
            if (stableFor >= WARNING_DECAY_MS && warningLevelRef.current > 0) {
              attentiveSince.current = now;
              setLevel((warningLevelRef.current - 1) as WarningLevel);
            }
          } else {
            s.awayMs += dt;
            setAttentionState("away");
            attentiveSince.current = null;
            awaySince.current ??= now;
            currentAwayMs.current = now - awaySince.current;
            if (currentAwayMs.current > s.longestAwayMs) s.longestAwayMs = currentAwayMs.current;

            if (!awayEventActive.current && currentAwayMs.current > AWAY_GRACE_MS) {
              awayEventActive.current = true;
              s.attentionAwayEvents += 1;
              const next = Math.min(warningLevelRef.current + 1, 2) as WarningLevel;
              const shown = emit(
                "attention",
                ATTENTION_WARNINGS[Math.min(next, ATTENTION_WARNINGS.length) - 1]!,
                "attention",
              );
              if (shown) {
                if (next === 1) s.warning1Count += 1;
                else s.warning2Count += 1;
                setLevel(next);
              }
            }
          }

          if (s.samples % 5 === 0) publish();
        }, MONITOR_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          setFaceStatus("unavailable");
          setAttentionState("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      landmarker?.close?.();
    };
  }, [active, videoRef, emit, publish]);

  return {
    faceStatus,
    engagement,
    attentionState,
    gazeDirection,
    warningLevel,
    calibrated,
    stats,
  };
}
