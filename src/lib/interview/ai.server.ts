/**
 * Server-only AI service layer.
 * All model access goes through the Lovable AI Gateway; the API key never
 * leaves the server. Swap the constants below to change providers/models.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const CHAT_MODEL = "google/gemini-3.7-flash";
const TRANSCRIBE_MODEL = "openai/gpt-4o-mini-transcribe";

export class AiServiceError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiServiceError("AI service is not configured.", 500);
  return key;
}

function friendly(status: number): string {
  if (status === 429) return "The AI service is busy. Please wait a moment and try again.";
  if (status === 402) return "AI credits have run out for this workspace. Please add credits to continue.";
  if (status === 403) return "AI access is currently blocked for this workspace.";
  return "The AI service is temporarily unavailable. Please try again.";
}

/** Ask the chat model for a JSON object and parse it defensively. */
export async function generateJson<T>(system: string, user: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey(),
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    throw new AiServiceError("Could not reach the AI service. Check your connection and try again.", 503);
  }

  if (!res.ok) {
    throw new AiServiceError(friendly(res.status), res.status);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseJson<T>(content);
  if (!parsed) throw new AiServiceError("The AI returned an unreadable response. Please try again.", 502);
  return parsed;
}

function safeParseJson<T>(raw: string): T | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Transcribe a temporary audio blob. The bytes are forwarded straight to the
 * transcription endpoint and are never written to disk or stored anywhere.
 */
export async function transcribeAudio(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name || "answer.webm");
  form.append("model", TRANSCRIBE_MODEL);

  let res: Response;
  try {
    res = await fetch(`${GATEWAY_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { "Lovable-API-Key": apiKey() },
      body: form,
    });
  } catch {
    throw new AiServiceError("Could not reach the transcription service. Please try again.", 503);
  }

  if (!res.ok) throw new AiServiceError(friendly(res.status), res.status);

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
