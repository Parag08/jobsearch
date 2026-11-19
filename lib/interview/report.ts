/**
 * The mock-interview debrief and transcript as Markdown files, for keeping or for feeding to
 * a local model (Parag, 2026-11-19). Pure: the page passes what it already shows, and every
 * section with nothing in it is left out. Markdown because any model reads it well and a
 * person can too.
 */
import { familyLabel } from "../pipeline-display";
import type { MockSession } from "./mock";
import { SCORE_DIMENSIONS, type Scores } from "./score";

export interface ReportInput {
  question: string;
  /** YYYY-MM-DD. */
  date: string;
  model?: string;
  overall?: number;
  scores?: Scores;
  strengths?: string[];
  improvements?: string[];
  /** Numbers said aloud that neither the written nor the model answer has. */
  saidNotWritten?: string[];
  comparison?: { covered: string[]; missed: string[]; different: string[] } | null;
  /** Already labelled ("The result", "held up"). */
  followUps?: { label: string; verdict: string; note: string }[];
  fillers?: { total: number; words: number; per100: number; counts: Record<string, number>; repeats: string[] };
  /** Delivery notes as shown on the page. */
  delivery?: string[];
  session: MockSession;
}

function turns(session: MockSession): string[] {
  return session.turns.flatMap((t) => {
    const who = t.role === "interviewer" ? (t.probe ? `Interviewer (follow-up: ${t.probe})` : "Interviewer") : "You";
    return [`**${who}:** ${t.text}`, ""];
  });
}

export function transcriptMarkdown(input: { question: string; date: string; session: MockSession }): string {
  return ["# Interview transcript", "", `Question: ${input.question}`, `Date: ${input.date}`, "", ...turns(input.session)].join("\n");
}

const list = (items: string[] | undefined) => (items ?? []).filter(Boolean).map((x) => `- ${x}`);

export function reportMarkdown(r: ReportInput): string {
  const out: string[] = ["# Interview feedback", "", `Question: ${r.question}`, `Date: ${r.date}`];
  if (r.model) out.push(`Scored by: ${r.model}`);
  out.push("");

  if (r.overall !== undefined) out.push(`Overall: ${r.overall.toFixed(1)} / 5`, "");
  if (r.scores) {
    out.push("| Dimension | Score (1-5) |", "| --- | --- |");
    for (const d of SCORE_DIMENSIONS) out.push(`| ${familyLabel(d)} | ${r.scores[d]} |`);
    out.push("");
  }
  if (r.saidNotWritten?.length) {
    out.push(
      `Note: You said ${r.saidNotWritten.join(", ")}, which neither your written answer nor the model answer contains. Say the same number every time.`,
      "",
    );
  }

  const section = (title: string, lines: string[]) => {
    if (lines.length) out.push(`## ${title}`, "", ...lines, "");
  };
  section("What worked", list(r.strengths));
  section("Do differently next time", list(r.improvements));
  if (r.comparison) {
    section("Against the model answer", [
      ...r.comparison.covered.map((x) => `- Covered: ${x}`),
      ...r.comparison.missed.map((x) => `- Missed: ${x}`),
      ...r.comparison.different.map((x) => `- Said differently: ${x}`),
    ]);
  }
  section(
    "Follow-ups",
    (r.followUps ?? []).map((f) => `- ${f.label} (${f.verdict}): ${f.note}`),
  );
  const delivery: string[] = [];
  if (r.fillers && r.fillers.words > 0) {
    const words = Object.entries(r.fillers.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([w, n]) => `“${w}” ×${n}`)
      .join(", ");
    const repeats = r.fillers.repeats.length ? ` Repeated: ${r.fillers.repeats.join(", ")}.` : "";
    delivery.push(`- Fillers: ${r.fillers.total} in ${r.fillers.words} words (${r.fillers.per100} per 100)${words ? `: ${words}` : ""}.${repeats}`);
  }
  delivery.push(...list(r.delivery));
  section("Delivery", delivery);

  out.push("## Transcript", "", ...turns(r.session));
  return out.join("\n");
}

/** interview-2026-11-19-walk-me-through-your-background-report.md */
export function reportFileName(question: string, date: string, kind: "report" | "transcript"): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `interview-${date}-${slug}-${kind}.md`;
}
