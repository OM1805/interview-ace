/** Static interview configuration shared by client and server. */

export const ROLES = [
  "Software Engineer",
  "Frontend Developer",
  "Backend Developer",
  "Data Analyst",
  "Data Scientist",
  "Product Manager",
  "Marketing",
  "HR",
  "Finance",
  "Other",
] as const;

export const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

export type Role = (typeof ROLES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_COUNT = 3;
export const SECONDS_PER_QUESTION = 10 * 60;
export const WARNING_SECONDS = 120;
export const CRITICAL_SECONDS = 30;

/** Camera monitoring thresholds (milliseconds). */
export const LOOK_AWAY_GRACE_MS = 3000;
export const NO_FACE_GRACE_MS = 3000;
export const WARNING_COOLDOWN_MS = 8000;

/** Max upload size for a temporary audio clip (bytes). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const SCORE_CATEGORIES = [
  { key: "englishQuality", label: "English Quality" },
  { key: "grammar", label: "Grammar" },
  { key: "sentenceFormation", label: "Sentence Formation" },
  { key: "clarity", label: "Clarity" },
  { key: "relevance", label: "Relevance" },
  { key: "answerQuality", label: "Answer Quality" },
] as const;

export type ScoreKey = (typeof SCORE_CATEGORIES)[number]["key"];
export type Scores = Record<ScoreKey, number>;

export interface Evaluation {
  scores: Scores;
  strengths: string[];
  improvements: string[];
  betterAnswer: string;
}

export interface AnswerRecord {
  question: string;
  transcript: string;
  evaluation: Evaluation;
  /** Average of the six category scores. */
  answerScore: number;
}

export interface FinalReport {
  overallScore: number;
  categoryScores: Scores;
  overallStrengths: string[];
  overallImprovements: string[];
  nextSteps: string[];
  summary: string;
}

export function averageScores(scores: Scores): number {
  const values = SCORE_CATEGORIES.map((c) => scores[c.key]);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
