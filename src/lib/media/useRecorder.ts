import { useCallback, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "stopped" | "error";

/**
 * Temporary microphone capture. Audio chunks live in memory only, are handed to
 * the transcription call once, and are dropped immediately afterwards.
 */
export function useRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setStatus("recording");
      return true;
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access in your browser settings to answer."
          : name === "NotFoundError"
            ? "No microphone was found. Please connect one and try again."
            : "The microphone could not be started. Please check your device settings.",
      );
      setStatus("error");
      return false;
    }
  }, []);

  /** Stops capture and returns the recorded clip (or null if nothing usable). */
  const stop = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setStatus("stopped");
      return null;
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const parts = chunksRef.current;
        chunksRef.current = [];
        resolve(parts.length ? new Blob(parts, { type: recorder.mimeType || "audio/webm" }) : null);
      };
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStatus("stopped");
    return blob && blob.size > 0 ? blob : null;
  }, []);

  const reset = useCallback(() => {
    chunksRef.current = [];
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, start, stop, reset, isRecording: status === "recording" };
}
