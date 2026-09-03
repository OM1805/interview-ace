import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  QUESTION_COUNT,
  ROLES,
  DIFFICULTIES,
  SCORE_CATEGORIES,
  averageScores,
  type Evaluation,
  type FinalReport,
  type Scores,
} from "./config";

const roleSchema = z.enum(ROLES);
const difficultySchema = z.enum(DIFFICULTIES);

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err && typeof err === "object" && "message" in err && typeof (err as Error).message === "string"
      ? (err as Error).message
      : "Something went wrong. Please try again.";
  return { ok: false, error: message };
}

const clamp = (n: unknown): number => {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
};

function normalizeScores(raw: unknown): Scores {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Scores;
  for (const c of SCORE_CATEGORIES) out[c.key] = clamp(obj[c.key]);
  return out;
}

const toList = (raw: unknown, max = 5): string[] =>
  Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max)
    : [];

/** 1. Interview question generation. */
export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ role: roleSchema, difficulty: difficultySchema }).parse(input),
  )
  .handler(async ({ data }): Promise<Result<string[]>> => {
    try {
      const { generateJson } = await import("./ai.server");
      const result = await generateJson<{ questions?: unknown }>(
        "You are an experienced technical interviewer. Reply with JSON only.",
        `Generate exactly ${QUESTION_COUNT} spoken mock-interview questions for a "${data.role}" role at "${data.difficulty}" level.
Rules: questions must be answerable verbally in 2-4 minutes, professional, clear, not multiple choice, and must not require writing or running code.
Return JSON: { "questions": ["...", "...", "..."] }`,
      );
      const questions = toList(result.questions, QUESTION_COUNT);
      if (questions.length !== QUESTION_COUNT) {
        return { ok: false, error: "Could not prepare the interview questions. Please try again." };
      }
      return { ok: true, data: questions };
    } catch (err) {
      return fail(err);
    }
  });

/** 2. Answer evaluation. Receives only text — never audio or video. */
export const evaluateAnswer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        role: roleSchema,
        difficulty: difficultySchema,
        question: z.string().min(1).max(2000),
        transcript: z.string().min(1).max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Result<Evaluation>> => {
    try {
      const { generateJson } = await import("./ai.server");
      const raw = await generateJson<Record<string, unknown>>(
        "You are a strict but fair interview coach. Reply with JSON only. Judge only the answer text; never speculate about the candidate's personality, emotions, honesty or confidence.",
        `Role: ${data.role}
Difficulty: ${data.difficulty}
Question: ${data.question}
Candidate answer transcript: """${data.transcript}"""

Score each category 0-100 and give feedback.
Return JSON:
{
 "englishQuality": 0, "grammar": 0, "sentenceFormation": 0, "clarity": 0, "relevance": 0, "answerQuality": 0,
 "strengths": ["..."], "improvements": ["..."],
 "betterAnswer": "A model answer to the same question, written as the candidate could have spoken it."
}`,
      );
      const evaluation: Evaluation = {
        scores: normalizeScores(raw),
        strengths: toList(raw["strengths"]),
        improvements: toList(raw["improvements"]),
        betterAnswer: typeof raw["betterAnswer"] === "string" ? raw["betterAnswer"] : "",
      };
      if (!evaluation.betterAnswer) {
        evaluation.betterAnswer = "No model answer was returned for this response.";
      }
      return { ok: true, data: evaluation };
    } catch (err) {
      return fail(err);
    }
  });

/** 3. Final interview report, derived from the three answer evaluations. */
export const generateReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        role: roleSchema,
        difficulty: difficultySchema,
        answers: z
          .array(
            z.object({
              question: z.string(),
              transcript: z.string(),
              scores: z.record(z.string(), z.number()),
            }),
          )
          .min(1)
          .max(QUESTION_COUNT),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Result<FinalReport>> => {
    // Deterministic scoring: category score = mean across answers,
    // overall score = mean of per-answer averages (mean of six categories).
    const categoryScores = {} as Scores;
    for (const c of SCORE_CATEGORIES) {
      const values = data.answers.map((a) => clamp(a.scores[c.key]));
      categoryScores[c.key] = Math.round(values.reduce((x, y) => x + y, 0) / values.length);
    }
    const answerAverages = data.answers.map((a) => averageScores(normalizeScores(a.scores)));
    const overallScore = Math.round(
      answerAverages.reduce((x, y) => x + y, 0) / answerAverages.length,
    );

    try {
      const { generateJson } = await import("./ai.server");
      const raw = await generateJson<Record<string, unknown>>(
        "You are an interview coach writing a concise performance report. Reply with JSON only. Comment only on answer content and communication; never on personality, emotions, honesty or confidence.",
        `Role: ${data.role}
Difficulty: ${data.difficulty}
Overall score (already computed): ${overallScore}
Answers:
${data.answers
  .map((a, i) => `Q${i + 1}: ${a.question}\nAnswer: ${a.transcript}\nScores: ${JSON.stringify(a.scores)}`)
  .join("\n\n")}

Return JSON:
{ "overallStrengths": ["..."], "overallImprovements": ["..."], "nextSteps": ["..."], "summary": "3-5 sentence performance summary" }`,
      );
      return {
        ok: true,
        data: {
          overallScore,
          categoryScores,
          overallStrengths: toList(raw["overallStrengths"]),
          overallImprovements: toList(raw["overallImprovements"]),
          nextSteps: toList(raw["nextSteps"]),
          summary: typeof raw["summary"] === "string" ? raw["summary"] : "",
        },
      };
    } catch (err) {
      return fail(err);
    }
  });
