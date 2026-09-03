import {
  CRITICAL_SECONDS,
  QUESTION_COUNT,
  WARNING_SECONDS,
} from "@/lib/interview/config";
import { cn } from "@/lib/utils";
import { Alert, Button, Card, StatusPill, type Tone } from "./ui";

export type AnswerPhase = "idle" | "recording" | "transcribing" | "ready" | "submitting";

const phaseLabel: Record<AnswerPhase, { text: string; tone: Tone }> = {
  idle: { text: "Not Started", tone: "neutral" },
  recording: { text: "Recording your answer", tone: "info" },
  transcribing: { text: "Transcribing…", tone: "info" },
  ready: { text: "Ready to submit", tone: "success" },
  submitting: { text: "Evaluating your answer…", tone: "info" },
};

interface Props {
  questionIndex: number;
  question: string;
  secondsLeft: number;
  phase: AnswerPhase;
  transcript: string;
  warnings: string[];
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onSubmit: () => void;
}

function formatTime(total: number): string {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function InterviewScreen({
  questionIndex,
  question,
  secondsLeft,
  phase,
  transcript,
  warnings,
  error,
  onStart,
  onStop,
  onSubmit,
}: Props) {
  const critical = secondsLeft <= CRITICAL_SECONDS;
  const warning = !critical && secondsLeft <= WARNING_SECONDS;
  const status = phaseLabel[phase];

  return (
    <div className="space-y-5">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Question {questionIndex + 1} of {QUESTION_COUNT}
          </p>
          <div
            aria-live="off"
            aria-label={`Time remaining ${formatTime(secondsLeft)}`}
            className={cn(
              "rounded-lg px-4 py-2 text-3xl font-bold tabular-nums",
              critical
                ? "bg-destructive-soft text-destructive"
                : warning
                  ? "bg-warning-soft text-warning-foreground"
                  : "bg-muted text-foreground",
            )}
          >
            {formatTime(secondsLeft)}
          </div>
        </div>

        <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          {question}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Answer status:</span>
          <StatusPill tone={status.tone}>{status.text}</StatusPill>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={onStart} disabled={phase !== "idle"}>
            START ANSWER
          </Button>
          <Button variant="secondary" onClick={onStop} disabled={phase !== "recording"}>
            STOP ANSWER
          </Button>
          <Button onClick={onSubmit} disabled={phase !== "ready" || transcript.trim().length === 0}>
            SUBMIT ANSWER
          </Button>
        </div>

        {(phase === "transcribing" || phase === "submitting") && (
          <Alert tone="info">
            {phase === "transcribing"
              ? "Converting your speech to text…"
              : "Your answer is being evaluated…"}
          </Alert>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <div>
          <h2 className="text-sm font-semibold text-foreground">Your Answer</h2>
          <p
            aria-live="polite"
            className="mt-2 min-h-24 whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm text-foreground"
          >
            {transcript || (
              <span className="text-muted-foreground">
                Your transcript will appear here after you stop the recording.
              </span>
            )}
          </p>
        </div>
      </Card>

      <div aria-live="polite" className="space-y-2">
        {warnings.map((w, i) => (
          <Alert key={`${w}-${i}`} tone="warning">
            {w}
          </Alert>
        ))}
      </div>
    </div>
  );
}
