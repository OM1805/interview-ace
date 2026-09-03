import { DIFFICULTIES, ROLES, type Difficulty, type Role } from "@/lib/interview/config";
import { Alert, Button, Card } from "./ui";

interface Props {
  role: Role;
  difficulty: Difficulty;
  onRoleChange: (role: Role) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onStart: () => void;
  loading: boolean;
  error: string | null;
}

const selectClass =
  "mt-2 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground shadow-xs";

export function SetupScreen({
  role,
  difficulty,
  onRoleChange,
  onDifficultyChange,
  onStart,
  loading,
  error,
}: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Practice session
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          AI Mock Interview
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          A short, structured practice interview with instant AI feedback on every answer.
        </p>
      </header>

      <Card className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="role" className="text-sm font-semibold text-foreground">
              Role
            </label>
            <select
              id="role"
              className={selectClass}
              value={role}
              onChange={(e) => onRoleChange(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="difficulty" className="text-sm font-semibold text-foreground">
              Difficulty
            </label>
            <select
              id="difficulty"
              className={selectClass}
              value={difficulty}
              onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <dl className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Questions
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">3</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Time per question
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">10 minutes</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Requirements
            </dt>
            <dd className="mt-1 text-sm text-foreground">Camera required · Microphone required</dd>
          </div>
        </dl>

        <div className="space-y-3 border-t border-border pt-5 text-sm text-muted-foreground">
          <p>
            This interview contains 3 questions. Each question has up to 10 minutes. Your camera
            will remain active during the interview. Camera engagement warnings are informational
            and do not automatically fail or terminate the interview.
          </p>
          <p>Audio is processed temporarily for transcription and is not permanently stored.</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Button onClick={onStart} disabled={loading} className="w-full sm:w-auto">
          {loading ? "Preparing questions…" : "START INTERVIEW"}
        </Button>
      </Card>
    </main>
  );
}
