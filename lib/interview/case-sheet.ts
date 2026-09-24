import { z } from "zod";

/**
 * A case interview as data: what the interviewer knows, and the path they steer along.
 *
 * The shape follows how good casebooks hand a case to the person giving it: a prompt,
 * facts released only when the candidate asks, and a sequence of questions - structure,
 * brainstorm, math, chart, recommendation - each with what a strong answer contains.
 * The AI interviewer reads this sheet and nothing else, so it cannot invent data.
 *
 * Cases live in data/interview/cases.json (rule 4). Every case there is original: written
 * for this app in the style of a firm's format, not copied from any casebook.
 */

export const QUESTION_KINDS = ["structure", "brainstorm", "math", "chart", "recommendation"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

const FactSchema = z.object({
  id: z.string().min(1),
  /** Words a candidate might use when asking for this - used to spot the request cheaply. */
  ask: z.array(z.string()).min(1),
  text: z.string().min(1),
});
export type CaseFact = z.infer<typeof FactSchema>;

const ExhibitSchema = z.object({
  title: z.string().min(1),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).min(1),
  note: z.string().optional(),
});
export type Exhibit = z.infer<typeof ExhibitSchema>;

const AnswerSchema = z.object({
  /** In absolute units: US$360m is 360000000; 20% is 20; 2.1x is 2.1. */
  value: z.number().finite(),
  display: z.string().min(1),
  /** Relative tolerance: 0.02 accepts anything within 2%. */
  tolerance: z.number().min(0).max(0.5),
  working: z.array(z.string()),
});

const CaseQuestionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(QUESTION_KINDS),
  ask: z.string().min(1),
  /** Shared as soon as the question is asked. */
  given: z.array(z.string()).optional(),
  /** Shared only if the candidate asks for it. */
  onRequest: z.array(z.string()).optional(),
  exhibit: ExhibitSchema.optional(),
  answer: AnswerSchema.optional(),
  /** Structure buckets, or the takeaways a chart should produce. */
  keyPoints: z.array(z.string()).optional(),
  ideas: z.array(z.object({ bucket: z.string(), items: z.array(z.string()) })).optional(),
  /** What separates an outstanding answer from a passing one. */
  advanced: z.array(z.string()).optional(),
});
export type CaseQuestion = z.infer<typeof CaseQuestionSchema>;

const CaseSheetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  firm: z.string().min(1),
  style: z.enum(["candidate-led", "interviewer-led"]),
  caseType: z.string().min(1),
  sector: z.string().min(1),
  level: z.enum(["easy", "medium", "hard"]),
  minutes: z.number().int().positive(),
  prompt: z.string().min(1),
  facts: z.array(FactSchema),
  questions: z.array(CaseQuestionSchema).min(2),
  recommendation: z.object({
    answer: z.string(),
    reasoning: z.array(z.string()),
    risks: z.array(z.string()),
    next: z.array(z.string()),
  }),
});
export type CaseSheet = z.infer<typeof CaseSheetSchema>;

export interface CaseLibrary {
  cases: CaseSheet[];
}

function dupes(ids: string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

/** Checks the shape AND the rules a case must keep for the interviewer to run it. */
function validate(c: CaseSheet): void {
  const dq = dupes(c.questions.map((q) => q.id));
  if (dq) throw new Error(`Case ${c.id}: duplicate question id "${dq}".`);
  const df = dupes(c.facts.map((f) => f.id));
  if (df) throw new Error(`Case ${c.id}: duplicate fact id "${df}".`);
  if (c.questions[0].kind !== "structure") throw new Error(`Case ${c.id} must open with a structure question.`);
  if (c.questions[c.questions.length - 1].kind !== "recommendation") {
    throw new Error(`Case ${c.id} must close with a recommendation question.`);
  }
  for (const q of c.questions) {
    if (q.kind === "math" && !q.answer) throw new Error(`Case ${c.id}: math question ${q.id} needs an answer.`);
    if (q.kind === "chart" && !q.exhibit) throw new Error(`Case ${c.id}: chart question ${q.id} needs an exhibit.`);
    q.exhibit?.rows.forEach((r, i) => {
      if (r.length !== q.exhibit!.columns.length) {
        throw new Error(`Case ${c.id}: row ${i + 1} of the exhibit in ${q.id} has ${r.length} cells for ${q.exhibit!.columns.length} columns.`);
      }
    });
  }
}

/** Parse and validate the whole library. Keys starting with "_" are documentation. */
export function parseCaseLibrary(raw: unknown): CaseLibrary {
  const cases = z.object({ cases: z.array(CaseSheetSchema) }).passthrough().parse(raw).cases;
  const d = dupes(cases.map((c) => c.id));
  if (d) throw new Error(`Duplicate case id "${d}".`);
  cases.forEach(validate);
  return { cases };
}

/** Filter by firm and case type; "all" (or omitted) means no filter. */
export function casesFor(lib: CaseLibrary, f: { firm?: string; caseType?: string }): CaseSheet[] {
  return lib.cases.filter(
    (c) => (!f.firm || f.firm === "all" || c.firm === f.firm) && (!f.caseType || f.caseType === "all" || c.caseType === f.caseType),
  );
}
