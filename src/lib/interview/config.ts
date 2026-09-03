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

/**
 * Gaze / attention monitoring configuration.
 * Approximate, landmark-based attention estimation — never eye tracking,
 * never cheating detection.
 */
/** Sustained attention-away time before an attention warning is raised. */
export const GAZE_GRACE_MS = 3000;
/** Sustained acceptable attention before an attention-away event is considered over. */
export const GAZE_RECOVERY_MS = 1000;
/** How many recent samples are smoothed into one stable gaze state. */
export const GAZE_SMOOTHING_SAMPLES = 5;
/** How many of those samples must agree before the state changes. */
export const GAZE_SMOOTHING_MAJORITY = 3;
/** Normalised iris offset thresholds inside the eye opening (0 = inner edge, 1 = outer edge). */
export const GAZE_HORIZONTAL_LEFT = 0.34;
export const GAZE_HORIZONTAL_RIGHT = 0.66;
/** Normalised iris position between the eyelids (0 = upper lid, 1 = lower lid). */
export const GAZE_VERTICAL_DOWN = 0.68;
export const GAZE_VERTICAL_UP = 0.22;
/** Eye-aspect ratio below which the eye is treated as closed (blink) and the sample is skipped. */
export const BLINK_EAR_THRESHOLD = 0.15;

/** The two informational attention warning levels. */
export const ATTENTION_WARNINGS = [
  "Please maintain your attention toward the camera.",
  "Repeated attention-away detected. Please maintain your attention toward the camera.",
] as const;

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
