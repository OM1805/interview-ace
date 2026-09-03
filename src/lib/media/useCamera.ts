import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "active" | "error";

/** Owns the webcam stream. Video is displayed live only and never recorded. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (streamRef.current) return true;
    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("active");
      return true;
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera access was denied. The camera is required for this interview — allow it in your browser settings and try again."
          : name === "NotFoundError"
            ? "No camera was found. Please connect a camera and try again."
            : "The camera could not be started. Please check that no other app is using it.",
      );
      setStatus("error");
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, status, error, start, stop };
}
