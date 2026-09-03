import { SCORE_CATEGORIES, type AnswerRecord, type FinalReport } from "@/lib/interview/config";
import type { CameraStats } from "@/lib/media/useFaceMonitor";
import { BulletList, Button, Card, ScoreBar } from "./ui";

interface Props {
  report: FinalReport;
  answers: AnswerRecord[];
  cameraStats: CameraStats;
  onRestart: () => void;
}

export function ReportScreen({ report, answers, cameraStats, onRestart }: Props) {
  const averageAnswerScore = Math.round(
    answers.reduce((sum, a) => sum + a.answerScore, 0) / Math.max(1, answers.length),
  );
  const engagement =
    cameraStats.samples > 0
      ? `${Math.round((cameraStats.facingSamples / cameraStats.samples) * 100)}%`
      : "Not measured";
  const classified = cameraStats.attentionMs + cameraStats.awayMs;
  const gazeAttention =
    classified > 0
      ? `${Math.round((cameraStats.attentionMs / classified) * 100)}%`
      : "Not measured";
  const seconds = (ms: number) => `${Math.round(ms / 1000)}s`;
  const trackingQuality =
    cameraStats.monitoredMs > 0
      ? `${Math.round((cameraStats.uncertainMs / cameraStats.monitoredMs) * 100)}% uncertain`
      : "Not measured";

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-10">
      <Card className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          AI Mock Interview Report
        </h1>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold tabular-nums text-primary">
            {report.overallScore}
          </span>
          <span className="text-sm text-muted-foreground">/100 overall score</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Scoring: each answer score is the average of its six category scores; the overall score is
          the average of the three answer scores.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Category Scores</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SCORE_CATEGORIES.map((c) => (
            <ScoreBar key={c.key} label={c.label} value={report.categoryScores[c.key]} />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Overall Strengths</h2>
          <BulletList items={report.overallStrengths} empty="No strengths were highlighted." />
        </Card>
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Overall Improvements</h2>
          <BulletList items={report.overallImprovements} empty="No improvements were listed." />
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recommended Next Steps</h2>
        <BulletList items={report.nextSteps} empty="No next steps were suggested." />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Interview Performance Summary</h2>
        <p className="text-sm text-foreground">{report.summary || "No summary was returned."}</p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Interview Metrics</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Questions completed
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">{answers.length} of 3</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Average answer score
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">{averageAnswerScore}/100</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Camera engagement
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">{engagement}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Gaze attention
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">{gazeAttention}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Attention warnings
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">
              {cameraStats.attentionWarnings}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Face warnings</dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">
              {cameraStats.faceWarnings}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Camera metrics describe framing and presence only. They are not used to infer confidence,
          personality, honesty, or any mental state, and they do not affect your scores.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Answers</h2>
        {answers.map((a, i) => (
          <details key={i} className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Question {i + 1} — {a.answerScore}/100
            </summary>
            <p className="mt-3 text-sm font-medium text-foreground">{a.question}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.transcript}</p>
          </details>
        ))}
      </Card>

      <Button onClick={onRestart}>START A NEW INTERVIEW</Button>
    </main>
  );
}
