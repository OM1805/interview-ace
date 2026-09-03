import { QUESTION_COUNT, SCORE_CATEGORIES, type AnswerRecord } from "@/lib/interview/config";
import { BulletList, Button, Card, ScoreBar } from "./ui";

interface Props {
  answer: AnswerRecord;
  questionIndex: number;
  onContinue: () => void;
  continueLabel: string;
}

export function AnalysisScreen({ answer, questionIndex, onContinue, continueLabel }: Props) {
  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Answer analysis · Question {questionIndex + 1} of {QUESTION_COUNT}
        </p>
        <h1 className="text-xl font-semibold leading-snug text-foreground">{answer.question}</h1>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Your Answer</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm text-foreground">
            {answer.transcript}
          </p>
        </div>
        <div className="flex items-baseline gap-2 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Answer score</span>
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {answer.answerScore}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Scores</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SCORE_CATEGORIES.map((c) => (
            <ScoreBar key={c.key} label={c.label} value={answer.evaluation.scores[c.key]} />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Strengths</h2>
          <BulletList items={answer.evaluation.strengths} empty="No strengths were highlighted." />
        </Card>
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Areas for Improvement</h2>
          <BulletList
            items={answer.evaluation.improvements}
            empty="No improvements were suggested."
          />
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Better Answer</h2>
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {answer.evaluation.betterAnswer}
        </p>
      </Card>

      <Button onClick={onContinue}>{continueLabel}</Button>
    </div>
  );
}
