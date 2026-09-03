import { defineTool } from "@lovable.dev/mcp-js";
import {
  DIFFICULTIES,
  QUESTION_COUNT,
  ROLES,
  SCORE_CATEGORIES,
  SECONDS_PER_QUESTION,
} from "@/lib/interview/config";

export default defineTool({
  name: "get_interview_config",
  title: "Get interview configuration",
  description:
    "List the roles, difficulty levels, question count, per-question time limit and scoring categories this mock-interview app supports.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const config = {
      roles: [...ROLES],
      difficulties: [...DIFFICULTIES],
      questionCount: QUESTION_COUNT,
      secondsPerQuestion: SECONDS_PER_QUESTION,
      scoreCategories: SCORE_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
      structuredContent: config,
    };
  },
});
