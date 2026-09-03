/** Client-side API communication for the interview. */

export async function transcribeBlob(blob: Blob): Promise<{ text: string } | { error: string }> {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  form.append("audio", blob, `answer.${ext}`);
  try {
    const res = await fetch("/api/public/transcribe", { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || !data.text) {
      return { error: data.error ?? "Transcription failed. Please try recording your answer again." };
    }
    return { text: data.text };
  } catch {
    return { error: "Network error while transcribing. Please check your connection and try again." };
  }
}
