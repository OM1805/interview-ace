import { useEffect, type RefObject } from "react";
import type { CameraStatus } from "@/lib/media/useCamera";
import type { EngagementStatus, FaceStatus, GazeStatus } from "@/lib/media/useFaceMonitor";
import { Alert, StatusPill, type Tone } from "./ui";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceStatus: FaceStatus;
  engagement: EngagementStatus;
  gaze: GazeStatus;
}

const faceLabel: Record<FaceStatus, { text: string; tone: Tone }> = {
  loading: { text: "Starting face detection…", tone: "info" },
  unavailable: { text: "Face detection unavailable", tone: "warning" },
  none: { text: "No Face Detected", tone: "warning" },
  one: { text: "Face Detected", tone: "success" },
  multiple: { text: "Multiple Faces Detected", tone: "error" },
};

const engagementLabel: Record<EngagementStatus, { text: string; tone: Tone }> = {
  unknown: { text: "Camera Engagement: Unknown", tone: "neutral" },
  facing: { text: "Camera Engagement: Facing camera", tone: "success" },
  away: { text: "Camera Engagement: Head turned away", tone: "warning" },
};

const gazeLabel: Record<GazeStatus, { text: string; tone: Tone }> = {
  unavailable: { text: "Gaze monitoring unavailable", tone: "warning" },
  unknown: { text: "Gaze Attention: Measuring…", tone: "neutral" },
  good: { text: "Gaze Attention: Good", tone: "success" },
  left: { text: "Gaze Attention: Looking left", tone: "warning" },
  right: { text: "Gaze Attention: Looking right", tone: "warning" },
  down: { text: "Gaze Attention: Looking down", tone: "warning" },
  away: { text: "Gaze Attention: Looking away", tone: "warning" },
};

export function CameraPanel({
  videoRef,
  stream,
  cameraStatus,
  cameraError,
  faceStatus,
  engagement,
  gaze,
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
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-primary/95">
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
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusPill tone={cameraStatus === "active" ? "success" : "warning"}>
          Camera: {cameraStatus === "active" ? "Active" : cameraStatus === "error" ? "Error" : "Off"}
        </StatusPill>
        <StatusPill tone={faceLabel[faceStatus].tone}>{faceLabel[faceStatus].text}</StatusPill>
        <StatusPill tone={engagementLabel[engagement].tone}>
          {engagementLabel[engagement].text}
        </StatusPill>
      </div>

      {cameraError && <Alert tone="error">{cameraError}</Alert>}

      <p className="text-xs text-muted-foreground">
        Video stays on your device. Nothing is recorded, stored, or sent for evaluation.
      </p>
    </aside>
  );
}
