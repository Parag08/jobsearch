import { describe, it, expect } from "vitest";
import { reportFileName, reportMarkdown, transcriptMarkdown } from "./report";

const session = {
  questionId: "fit-background",
  tone: "neutral" as const,
  maxFollowUps: 2,
  status: "done" as const,
  turns: [
    { role: "interviewer" as const, text: "Walk me through your background.", at: "2026-11-19T10:00:00Z" },
    { role: "candidate" as const, text: "I started as a software engineer.", at: "2026-11-19T10:00:30Z" },
    { role: "interviewer" as const, text: "What was the result?", probe: "result" as const, at: "2026-11-19T10:01:00Z" },
    { role: "candidate" as const, text: "Customers moved 10 PB.", at: "2026-11-19T10:01:20Z" },
  ],
};

describe("transcriptMarkdown", () => {
  it("is the question, then who said what, in order", () => {
    const md = transcriptMarkdown({ question: "Walk me through your background.", date: "2026-11-19", session });
    expect(md).toBe(
      [
        "# Interview transcript",
        "",
        "Question: Walk me through your background.",
        "Date: 2026-11-19",
        "",
        "**Interviewer:** Walk me through your background.",
        "",
        "**You:** I started as a software engineer.",
        "",
        "**Interviewer (follow-up: result):** What was the result?",
        "",
        "**You:** Customers moved 10 PB.",
        "",
      ].join("\n"),
    );
  });
});

describe("reportMarkdown", () => {
  const md = reportMarkdown({
    question: "Walk me through your background.",
    date: "2026-11-19",
    model: "mistral/mistral-medium-3.5",
    overall: 2.7,
    scores: { structure: 2, ownership: 3, specificity: 3, impact: 4, reflection: 1, relevance: 3 },
    strengths: ["Concrete impact metrics"],
    improvements: ["Lead with the result"],
    saidNotWritten: ["20"],
    comparison: { covered: ["Nutanix Move"], missed: ["Gartner rating"], different: ["You said “20”; the model answer says “11”"] },
    followUps: [{ label: "The result", verdict: "held up", note: "Named the 10 PB." }],
    fillers: { total: 7, words: 411, per100: 1.7, counts: { like: 4, uh: 1 }, repeats: ["cloud cloud"] },
    delivery: ["Good pace: 154 words a minute."],
    session,
  });

  it("leads with the score and every dimension", () => {
    expect(md).toContain("Overall: 2.7 / 5");
    expect(md).toContain("| Reflection | 1 |");
  });

  it("carries every section and the transcript, with no stray objects", () => {
    for (const t of [
      "## What worked",
      "- Concrete impact metrics",
      "## Do differently next time",
      "## Against the model answer",
      "- Missed: Gartner rating",
      "- Said differently: You said “20”; the model answer says “11”",
      "## Follow-ups",
      "- The result (held up): Named the 10 PB.",
      "7 in 411 words (1.7 per 100): “like” ×4, “uh” ×1. Repeated: cloud cloud.",
      "Good pace: 154 words a minute.",
      "You said 20, which neither your written answer nor the model answer contains.",
      "## Transcript",
      "**You:** Customers moved 10 PB.",
    ]) {
      expect(md).toContain(t);
    }
    expect(md).not.toContain("[object Object]");
  });

  it("leaves out sections that have nothing in them", () => {
    const bare = reportMarkdown({ question: "Q", date: "2026-11-19", overall: 3, scores: { structure: 3, ownership: 3, specificity: 3, impact: 3, reflection: 3, relevance: 3 }, session });
    expect(bare).not.toContain("## Against the model answer");
    expect(bare).not.toContain("## Follow-ups");
    expect(bare).toContain("## Transcript");
  });
});

describe("reportFileName", () => {
  it("is a safe, dated slug of the question", () => {
    expect(reportFileName("Walk me through your background.", "2026-11-19", "report")).toBe("interview-2026-11-19-walk-me-through-your-background-report.md");
  });
});
