import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { DIFFICULTIES, QUESTION_COUNT, ROLES } from "@/lib/interview/config";

export default defineTool({
  name: "generate_interview_questions",
  title: "Generate interview questions",
  description: `Generate exactly ${QUESTION_COUNT} spoken mock-interview questions for a role and difficulty level.`,
  inputSchema: {
    role: z.enum(ROLES).describe("Interview role, e.g. \"Software Engineer\"."),
    difficulty: z.enum(DIFFICULTIES).describe("Difficulty level."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ role, difficulty }) => {
    const { generateJson } = await import("@/lib/interview/ai.server");
    const result = await generateJson<{ questions?: unknown }>(
      "You are an experienced technical interviewer. Reply with JSON only.",
      `Generate exactly ${QUESTION_COUNT} spoken mock-interview questions for a "${role}" role at "${difficulty}" level.
Rules: questions must be answerable verbally in 2-4 minutes, professional, clear, not multiple choice, and must not require writing or running code.
Return JSON: { "questions": ["...", "...", "..."] }`,
    );
    const questions = Array.isArray(result.questions)
      ? result.questions
          .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
          .slice(0, QUESTION_COUNT)
      : [];
    if (questions.length !== QUESTION_COUNT) {
      throw new ToolError(`Could not generate ${QUESTION_COUNT} questions. Please try again.`);
    }
    return {
      content: [{ type: "text", text: questions.map((q, i) => `${i + 1}. ${q}`).join("\n") }],
      structuredContent: { role, difficulty, questions },
    };
  },
});
