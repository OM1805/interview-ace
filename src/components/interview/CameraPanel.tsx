import { useEffect, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { CameraStatus } from "@/lib/media/useCamera";
import type {
  AttentionState,
  EngagementStatus,
  FaceStatus,
  WarningLevel,
} from "@/lib/media/useFaceMonitor";
import type { GazeDirection } from "@/lib/media/gaze";
import { Alert, StatusPill, type Tone } from "./ui";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceStatus: FaceStatus;
  engagement: EngagementStatus;
  attentionState: AttentionState;
  gazeDirection: GazeDirection;
  warningLevel: WarningLevel;
  calibrated: boolean;
}

const faceLabel: Record<FaceStatus, { text: string; tone: Tone }> = {
  loading: { text: "Starting attention monitoring…", tone: "info" },
  unavailable: { text: "Attention monitoring unavailable", tone: "warning" },
  none: { text: "No Face Detected", tone: "warning" },
  one: { text: "Face Detected", tone: "success" },
  multiple: { text: "Multiple Faces Detected", tone: "error" },
};

const engagementLabel: Record<EngagementStatus, { text: string; tone: Tone }> = {
  unknown: { text: "Camera Engagement: Unknown", tone: "neutral" },
  facing: { text: "Camera Engagement: Facing camera", tone: "success" },
  away: { text: "Camera Engagement: Head turned away", tone: "warning" },
};

const attentionLabel: Record<AttentionState, { text: string; tone: Tone }> = {
  unavailable: { text: "Gaze Attention: Tracking unavailable", tone: "warning" },
  calibrating: { text: "Gaze Attention: Calibrating…", tone: "info" },
  uncertain: { text: "Gaze Attention: Tracking uncertain", tone: "neutral" },
  "toward-camera": { text: "Gaze Attention: Toward camera", tone: "success" },
  away: { text: "Gaze Attention: Looking away", tone: "warning" },
  "no-face": { text: "Gaze Attention: No face in view", tone: "warning" },
  "multiple-faces": { text: "Gaze Attention: Multiple faces in view", tone: "warning" },
};

/** Descriptive, non-numeric gaze direction. Raw coordinates are never shown. */
const directionLabel: Record<GazeDirection, string> = {
  unknown: "Measuring",
  center: "Toward camera",
  "slight-left": "Slightly left",
  "strong-left": "Left",
  "slight-right": "Slightly right",
  "strong-right": "Right",
  "slight-up": "Slightly up",
  "strong-up": "Up",
  "slight-down": "Slightly down",
  "strong-down": "Down",
  "upper-left": "Upper left",
  "upper-right": "Upper right",
  "lower-left": "Lower left",
  "lower-right": "Lower right",
};

/** Camera highlight is derived purely from the warningLevel state. */
const frameClasses: Record<WarningLevel, string> = {
  0: "border-border shadow-none",
  1: "border-warning shadow-[0_0_0_4px_var(--warning-soft),0_0_18px_-2px_var(--warning)]",
  2: "border-destructive shadow-[0_0_0_4px_var(--destructive-soft),0_0_18px_-2px_var(--destructive)]",
};

export function CameraPanel({
  videoRef,
  stream,
  cameraStatus,
  cameraError,
  faceStatus,
  engagement,
  attentionState,
  gazeDirection,
  warningLevel,
  calibrated,
}: Props) {
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [stream, videoRef]);

  return (
    <aside className="surface-card space-y-4 p-4" aria-label="Camera monitoring">
      <div
        className={cn(
          "relative aspect-4/3 w-full overflow-hidden rounded-lg border-2 bg-primary/95 transition-all duration-500 ease-out",
          frameClasses[warningLevel],
        )}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Live webcam preview"
          className="h-full w-full scale-x-[-1] object-cover"
        />
        {cameraStatus !== "active" && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-primary-foreground">
            {cameraStatus === "requesting" ? "Waiting for camera permission…" : "Camera is off"}
          </div>
        )}
        {cameraStatus === "active" && attentionState === "calibrating" && (
          <div className="absolute inset-x-0 bottom-0 bg-primary/80 px-3 py-2 text-center text-xs font-medium text-primary-foreground">
            Look naturally toward the camera for calibration.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusPill tone={cameraStatus === "active" ? "success" : "warning"}>
          Camera:{" "}
          {cameraStatus === "active" ? "Active" : cameraStatus === "error" ? "Error" : "Off"}
        </StatusPill>
        <StatusPill tone={faceLabel[faceStatus].tone}>{faceLabel[faceStatus].text}</StatusPill>
        <StatusPill tone={engagementLabel[engagement].tone}>
          {engagementLabel[engagement].text}
        </StatusPill>
        <StatusPill tone={attentionLabel[attentionState].tone}>
          {attentionLabel[attentionState].text}
        </StatusPill>
        {attentionState !== "calibrating" && gazeDirection !== "unknown" && (
          <StatusPill tone="neutral">Direction: {directionLabel[gazeDirection]}</StatusPill>
        )}
        {calibrated && <StatusPill tone="info">Calibrated</StatusPill>}
      </div>

      {cameraError && <Alert tone="error">{cameraError}</Alert>}

      <p className="text-xs text-muted-foreground">
        Approximate gaze attention is estimated on your device only. Video stays on your device.
        Nothing is recorded, stored, or sent for evaluation.
      </p>
    </aside>
  );
}
