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
 * Approximate gaze / attention monitoring configuration.
 * Coarse, landmark-based attention estimation — never exact eye tracking,
 * never cheating, honesty, emotion or personality inference.
 * Every value below is local-only and configurable in one place.
 */

/** Detection tick period. One MediaPipe inference per tick. */
export const MONITOR_INTERVAL_MS = 100;

/** Local, temporary calibration of the candidate's neutral pose. */
export const CALIBRATION_DURATION_MS = 4000;
/** Minimum usable samples before a calibration baseline is accepted. */
export const CALIBRATION_MIN_SAMPLES = 12;

/** Sustained attention-away time before an attention warning is raised. */
export const AWAY_GRACE_MS = 3000;
/** Sustained acceptable attention before an attention-away event is considered over. */
export const RECOVERY_MS = 1200;

/** Acceptable attention region around the calibrated neutral point (normalised -1..1). */
export const GAZE_TOLERANCE_X = 0.34;
export const GAZE_TOLERANCE_Y = 0.36;
/** Head-pose tolerance around the calibrated neutral pose (normalised units). */
export const HEAD_YAW_TOLERANCE = 0.42;
export const HEAD_PITCH_TOLERANCE = 0.4;

/** Boundary between "slight" and "strong" descriptive gaze labels. */
export const GAZE_STRONG_X = 0.6;
export const GAZE_STRONG_Y = 0.6;

/** Exponential-moving-average factor for gaze/head smoothing (0..1, higher = faster). */
export const SMOOTHING_ALPHA = 0.35;

/** Below this reliability the state is reported as uncertain and never warned on. */
export const RELIABILITY_THRESHOLD = 0.45;
/** Normalised inter-eye distance below which the face is considered too small/far. */
export const MIN_FACE_WIDTH = 0.055;
/** Disagreement between both eyes above which reliability is reduced. */
export const EYE_DISAGREEMENT_LIMIT = 0.9;

/** Gaze speed (normalised units per second) treated as a rapid gaze shift. */
export const RAPID_GAZE_THRESHOLD = 3.5;
/** Window and count used to record a "repeated rapid shifts" behaviour. */
export const RAPID_SHIFT_WINDOW_MS = 4000;
export const RAPID_SHIFT_REPEAT_COUNT = 4;

/** Eye-aspect ratio below which the eye is treated as closed (blink). */
export const BLINK_EAR_THRESHOLD = 0.15;
/** Continuous closure longer than this is recorded as an extended eye closure. */
export const EXTENDED_CLOSURE_THRESHOLD_MS = 1500;

/** Sustained attention required before the warning highlight steps back down one level. */
export const WARNING_DECAY_MS = 6000;

/** The two informational attention warning levels (never blocking, never failing). */
export const ATTENTION_WARNINGS = [
  "Please keep your attention toward the camera.",
  "Please return your attention toward the camera.",
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
