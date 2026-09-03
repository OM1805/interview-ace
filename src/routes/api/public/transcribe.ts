import { createFileRoute } from "@tanstack/react-router";
import { MAX_AUDIO_BYTES } from "@/lib/interview/config";

/**
 * Speech-to-text endpoint.
 * Accepts a temporary audio clip as multipart/form-data, forwards the bytes to
 * the transcription model in-memory, and returns the transcript. The audio is
 * never written to disk or persisted anywhere; the buffer is released as soon
 * as the request completes.
 */
export const Route = createFileRoute("/api/public/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          });

        try {
          const form = await request.formData();
          const file = form.get("audio");
          if (!(file instanceof File)) {
            return json({ error: "No audio was received. Please record an answer and try again." }, 400);
          }
          if (file.size === 0) {
            return json({ error: "The recording was empty. Please record your answer again." }, 400);
          }
          if (file.size > MAX_AUDIO_BYTES) {
            return json({ error: "The recording is too long to process. Please keep answers shorter." }, 413);
          }

          const { transcribeAudio, AiServiceError } = await import("@/lib/interview/ai.server");
          try {
            const text = await transcribeAudio(file);
            if (!text) {
              return json(
                { error: "We couldn't hear any speech in that recording. Please try answering again." },
                422,
              );
            }
            return json({ text });
          } catch (err) {
            if (err instanceof AiServiceError) return json({ error: err.message }, err.status);
            throw err;
          }
        } catch {
          return json({ error: "Transcription failed. Please try again." }, 500);
        }
      },
    },
  },
});
