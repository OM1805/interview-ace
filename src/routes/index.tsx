import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SetupScreen } from "@/components/interview/SetupScreen";
import { InterviewScreen, type AnswerPhase } from "@/components/interview/InterviewScreen";
import { AnalysisScreen } from "@/components/interview/AnalysisScreen";
import { ReportScreen } from "@/components/interview/ReportScreen";
import { CameraPanel } from "@/components/interview/CameraPanel";
import { Alert, Card } from "@/components/interview/ui";
import {
  QUESTION_COUNT,
  SECONDS_PER_QUESTION,
  averageScores,
  type AnswerRecord,
  type Difficulty,
  type FinalReport,
  type Role,
} from "@/lib/interview/config";
import {
  evaluateAnswer,
  generateQuestions,
  generateReport,
} from "@/lib/interview/interview.functions";
import { transcribeBlob } from "@/lib/interview/api";
import { useCamera } from "@/lib/media/useCamera";
import { useRecorder } from "@/lib/media/useRecorder";
import { useFaceMonitor } from "@/lib/media/useFaceMonitor";

const TITLE = "AI Mock Interview — Practice with instant AI feedback";
const DESCRIPTION =
  "Run a 3-question spoken mock interview with live camera checks, speech-to-text answers, per-answer AI scoring, and a final performance report.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InterviewApp,
});

type Phase = "setup" | "preparing" | "interview" | "analysis" | "report" | "reporting";

function InterviewApp() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [role, setRole] = useState<Role>("Software Engineer");
  const [difficulty, setDifficulty] = useState<Difficulty>("Intermediate");
  const [setupError, setSetupError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [report, setReport] = useState<FinalReport | null>(null);

  const [answerPhase, setAnswerPhase] = useState<AnswerPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [warnings, setWarnings] = useState<{ id: number; text: string }[]>([]);

  const camera = useCamera();
  const recorder = useRecorder();
  const submittingRef = useRef(false);

  const pushWarning = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setWarnings((prev) => [...prev.slice(-2), { id, text }]);
    setTimeout(() => setWarnings((prev) => prev.filter((w) => w.id !== id)), 6000);
  }, []);

  const monitorActive = phase === "interview" || phase === "analysis";
  const { faceStatus, engagement, gaze, stats } = useFaceMonitor(
    camera.videoRef,
    monitorActive && camera.status === "active",
    pushWarning,
  );

  /** Setup → questions. */
  const handleStart = useCallback(async () => {
    setSetupError(null);
    setPhase("preparing");
    const cameraOk = await camera.start();
    if (!cameraOk) {
      setSetupError(
        "The camera is required for this interview. Please allow camera access and try again.",
      );
      setPhase("setup");
      return;
    }
    const result = await generateQuestions({ data: { role, difficulty } }).catch(() => null);
    if (!result || !result.ok || result.data.length !== QUESTION_COUNT) {
      setSetupError(
        result && !result.ok
          ? result.error
          : "The interview questions could not be prepared. Please try again.",
      );
      camera.stop();
      setPhase("setup");
      return;
    }
    setQuestions(result.data);
    setIndex(0);
    setAnswers([]);
    setTranscript("");
    setAnswerPhase("idle");
    setSecondsLeft(SECONDS_PER_QUESTION);
    setPhase("interview");
  }, [camera, role, difficulty]);

  /** Recording controls. */
  const handleStopAnswer = useCallback(async () => {
    setAnswerPhase("transcribing");
    setAnswerError(null);
    const blob = await recorder.stop();
    if (!blob) {
      setAnswerError("No audio was captured. Please start your answer again.");
      setAnswerPhase("idle");
      recorder.reset();
      return;
    }
    const result = await transcribeBlob(blob);
    // The temporary clip is dropped here; it is never stored.
    recorder.reset();
    if ("error" in result) {
      setAnswerError(result.error);
      setAnswerPhase("idle");
      return;
    }
    setTranscript(result.text);
    setAnswerPhase("ready");
  }, [recorder]);

  const handleStartAnswer = useCallback(async () => {
    setAnswerError(null);
    setTranscript("");
    const ok = await recorder.start();
    if (!ok) {
      setAnswerError(recorder.error ?? "The microphone could not be started.");
      setAnswerPhase("idle");
      return;
    }
    setSecondsLeft(SECONDS_PER_QUESTION);
    setAnswerPhase("recording");
  }, [recorder]);

  /** Countdown timer; expiry stops capture safely without failing the candidate. */
  useEffect(() => {
    if (answerPhase !== "recording") return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleStopAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [answerPhase, handleStopAnswer]);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current || answerPhase !== "ready" || !transcript.trim()) return;
    submittingRef.current = true;
    setAnswerPhase("submitting");
    setAnswerError(null);
    const question = questions[index] ?? "";
    const result = await evaluateAnswer({
      data: { role, difficulty, question, transcript },
    }).catch(() => null);
    submittingRef.current = false;
    if (!result || !result.ok) {
      setAnswerError(
        result && !result.ok ? result.error : "The evaluation service is unavailable right now.",
      );
      setAnswerPhase("ready");
      return;
    }
    setAnswers((prev) => [
      ...prev,
      {
        question,
        transcript,
        evaluation: result.data,
        answerScore: averageScores(result.data.scores),
      },
    ]);
    setPhase("analysis");
  }, [answerPhase, transcript, questions, index, role, difficulty]);

  const handleContinue = useCallback(async () => {
    if (index + 1 < QUESTION_COUNT) {
      setIndex((i) => i + 1);
      setTranscript("");
      setAnswerPhase("idle");
      setAnswerError(null);
      setSecondsLeft(SECONDS_PER_QUESTION);
      setPhase("interview");
      return;
    }
    setPhase("reporting");
    const result = await generateReport({
      data: {
        role,
        difficulty,
        answers: answers.map((a) => ({
          question: a.question,
          transcript: a.transcript,
          scores: a.evaluation.scores as unknown as Record<string, number>,
        })),
      },
    }).catch(() => null);
    camera.stop();
    if (!result || !result.ok) {
      setSetupError(
        result && !result.ok ? result.error : "The final report could not be generated.",
      );
      setPhase("analysis");
      return;
    }
    setReport(result.data);
    setPhase("report");
  }, [index, answers, role, difficulty, camera]);

  const handleRestart = useCallback(() => {
    camera.stop();
    setReport(null);
    setAnswers([]);
    setQuestions([]);
    setIndex(0);
    setTranscript("");
    setAnswerPhase("idle");
    setAnswerError(null);
    setSetupError(null);
    setPhase("setup");
  }, [camera]);

  if (phase === "setup" || phase === "preparing") {
    return (
      <SetupScreen
        role={role}
        difficulty={difficulty}
        onRoleChange={setRole}
        onDifficultyChange={setDifficulty}
        onStart={handleStart}
        loading={phase === "preparing"}
        error={setupError}
      />
    );
  }

  if (phase === "report" && report) {
    return (
      <ReportScreen
        report={report}
        answers={answers}
        cameraStats={stats}
        onRestart={handleRestart}
      />
    );
  }

  const lastAnswer = answers[answers.length - 1];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {phase === "interview" && (
            <InterviewScreen
              questionIndex={index}
              question={questions[index] ?? ""}
              secondsLeft={secondsLeft}
              phase={answerPhase}
              transcript={transcript}
              warnings={warnings.map((w) => w.text)}
              error={answerError}
              onStart={handleStartAnswer}
              onStop={handleStopAnswer}
              onSubmit={handleSubmit}
            />
          )}

          {phase === "analysis" && lastAnswer && (
            <div className="space-y-4">
              {setupError && <Alert tone="error">{setupError}</Alert>}
              <AnalysisScreen
                answer={lastAnswer}
                questionIndex={index}
                onContinue={handleContinue}
                continueLabel={index + 1 < QUESTION_COUNT ? "CONTINUE" : "VIEW FINAL REPORT"}
              />
            </div>
          )}

          {phase === "reporting" && (
            <Card>
              <p className="text-sm text-muted-foreground">Generating your final report…</p>
            </Card>
          )}
        </div>

        <CameraPanel
          videoRef={camera.videoRef}
          stream={camera.stream}
          cameraStatus={camera.status}
          cameraError={camera.error}
          faceStatus={faceStatus}
          engagement={engagement}
          gaze={gaze}
        />
      </div>
    </main>
  );
}
