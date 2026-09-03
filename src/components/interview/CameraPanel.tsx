import { useEffect, type RefObject } from "react";
import type { CameraStatus } from "@/lib/media/useCamera";
import type { EngagementStatus, FaceStatus } from "@/lib/media/useFaceMonitor";
import { Alert, StatusPill, type Tone } from "./ui";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceStatus: FaceStatus;
  engagement: EngagementStatus;
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
  away: { text: "Camera Engagement: Looking away", tone: "warning" },
};

export function CameraPanel({
  videoRef,
  stream,
  cameraStatus,
  cameraError,
  faceStatus,
  engagement,
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
