import { z } from "zod";
import { canonicalNumber, extractNumbers } from "../stories/consistency";
import { PROBE_HELP, REFERENCE_RULE, probeCandidates, type ProbeKind } from "./mock";

/**
 * Role-plays (docs/FULL-INTERVIEW.md section 2): a sample exchange for one question - the
 * question, a strong spoken answer built on the model answer, two or three likely follow-ups
 * and strong replies, each candidate line with a short "why this works".
 *
 * Which follow-ups to show is chosen by the same rules the live interviewer uses
 * (`probeCandidates` run on the model answer). The play is refused if a candidate line states
 * a number that is in neither the model answer nor the written answer, or the interviewer
 * states one nobody said (the honesty rule, as guardRewrite). The first line is always the
 * real question, set by code.
 */

export const ROLE_PLAY_SOURCES = ["ai", "agent"] as const;
export type RolePlaySource = (typeof ROLE_PLAY_SOURCES)[number];

export interface RolePlayLine {
  who: "interviewer" | "candidate";
  say: string;
  /** Candidate lines: why this works, in one line. */
  why?: string;
}

export interface RolePlay {
  questionId: string;
  lines: RolePlayLine[];
  source: RolePlaySource;
  /** rolePlayBasis of the model answer it was built from, so a changed answer shows as stale. */
  basedOn: string;
  model: string | null;
  updatedAt: string;
}

export const ROLE_PLAY_LIMITS = { minLines: 4, maxLines: 14, say: 1200, why: 240 } as const;

/** A short fingerprint of a model answer (FNV-1a), so a play built on an older answer is marked stale. */
export function rolePlayBasis(modelAnswer: string): string {
  let h = 0x811c9dc5;
  for (const ch of modelAnswer.trim()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The follow-ups a real interviewer would reach for after this answer, best first, at most three. */
export function likelyFollowUps(modelAnswer: string): ProbeKind[] {
  const asMock = { questionId: "q", tone: "neutral" as const, maxFollowUps: 4, status: "running" as const, turns: [] };
  const gaps = probeCandidates(asMock, modelAnswer, "");
  const picked = gaps.filter((g) => g !== "depth").slice(0, 2);
  return [...picked, "depth"];
}

export function buildRolePlayPrompt(input: {
  question: string;
  lookFor: string;
  interviewer: string | null;
  context: string | null;
  contextLabel: string | null;
  modelAnswer: string;
  followUps: ProbeKind[];
}): string {
  const who = input.interviewer ?? "an experienced interviewer";
  return [
    `Write a short role-play of a real interview moment: ${who} asks one question, and a strong candidate answers it.`,
    "It is a teaching example: the candidate will read and hear it to learn how a strong answer sounds out loud and holds up under follow-ups.",
    "",
    `Question: ${input.question}`,
    `A strong answer shows: ${input.lookFor}`,
    input.context ? `Context (${input.contextLabel ?? "from the job description"}): ${input.context}` : "",
    "",
    "The candidate's model answer (their own evidence - the ONLY source of facts for the candidate's lines):",
    input.modelAnswer,
    "",
    "The exchange:",
    "1. The interviewer asks the question.",
    "2. The candidate answers it out loud: the model answer, condensed to about 90 seconds of speech, result first.",
    `3. Then ${input.followUps.length} follow-ups the interviewer is likely to ask, in this order, each with the candidate's strong reply:`,
    ...input.followUps.map((f) => `   - ${f}: ${PROBE_HELP[f]}`),
    "",
    "Rules:",
    "- The candidate says only what the model answer supports. Never add a number, name, tool or claim that is not in it. If a follow-up goes past the evidence, the strong reply says so honestly and says how they would find out.",
    "- The interviewer never states a fact or number the candidate did not say.",
    "- Spoken English: short sentences, first person, no headings or bullet points.",
    "- On each candidate line, 'why' is one short line on what makes it work (e.g. 'Leads with the result, then the how').",
    REFERENCE_RULE,
    "",
    "Reply with JSON only, exactly this shape:",
    '{"lines":[{"who":"interviewer","say":"..."},{"who":"candidate","say":"...","why":"..."}]}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const LineSchema = z.object({
  who: z.enum(["interviewer", "candidate"]),
  say: z.string().trim().min(1).max(ROLE_PLAY_LIMITS.say),
  why: z.string().trim().max(ROLE_PLAY_LIMITS.why).nullable().optional(),
});

/** An agent-written play over MCP: bounded, refused (never cut) when over a limit. */
export const RolePlayInputSchema = z.array(LineSchema).min(2).max(ROLE_PLAY_LIMITS.maxLines);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const ModelRolePlaySchema = z.object({
  lines: z.array(
    z.object({
      who: LineSchema.shape.who,
      say: z.coerce.string().transform((s) => clean(s).slice(0, ROLE_PLAY_LIMITS.say)).default(""),
      why: z.unknown().optional(),
    }).nullable().catch(null),
  ),
});

/** The model's play, validated. The first line is replaced by the real question. */
export function parseRolePlay(raw: unknown, question: string): RolePlayLine[] {
  // A blank interviewer line still marks the boundary of its answer.
  const loose = ModelRolePlaySchema.parse(raw).lines
    .filter((line) => line !== null)
    .filter((line) => line.who === "interviewer" || line.say !== "");
  if (loose[0]?.who !== "interviewer") throw new Error("A role-play opens with the interviewer asking the question.");
  const lines: RolePlayLine[] = [];
  for (let i = 0; i < loose.length - 1; i++) {
    const ask = loose[i];
    const reply = loose[i + 1];
    const prompt = i === 0 ? question : ask.say;
    if (ask.who !== "interviewer" || reply.who !== "candidate" || !prompt) {
      if (i === 0) throw new Error("A role-play needs an answer to its opening question.");
      continue;
    }
    const line: RolePlayLine = { who: "candidate", say: reply.say };
    if (typeof reply.why === "string" && clean(reply.why)) line.why = clean(reply.why).slice(0, ROLE_PLAY_LIMITS.why);
    lines.push({ who: "interviewer", say: prompt }, line);
  }
  return normaliseLines(lines, question);
}

/** Shared by the model's play and an agent's: opens on the interviewer, has real answers, sized. */
export function normaliseLines(lines: RolePlayLine[], question: string): RolePlayLine[] {
  if (lines[0]?.who !== "interviewer") throw new Error("A role-play opens with the interviewer asking the question.");
  if (lines.length < ROLE_PLAY_LIMITS.minLines) throw new Error(`A role-play needs at least ${ROLE_PLAY_LIMITS.minLines} lines.`);
  if (lines.filter((l) => l.who === "candidate").length < 2) throw new Error("A role-play needs at least two candidate replies.");
  return [{ who: "interviewer", say: question }, ...lines.slice(1, ROLE_PLAY_LIMITS.maxLines)];
}

export type RolePlayCheck = { ok: true; lines: RolePlayLine[] } | { ok: false; invented: string[] };

export function guardRolePlay(lines: RolePlayLine[], evidence: { modelAnswer: string; written: string }): RolePlayCheck {
  const canon = (t: string) => extractNumbers(t).map(canonicalNumber);
  const evidenced = new Set([...canon(evidence.modelAnswer), ...canon(evidence.written)]);
  const said = new Set([...evidenced, ...lines.filter((l) => l.who === "candidate").flatMap((l) => canon(l.say)), ...canon(lines[0]?.say ?? "")]);
  const invented: string[] = [];
  for (const l of lines) {
    const known = l.who === "candidate" ? evidenced : said;
    for (const n of extractNumbers(l.say)) if (!known.has(canonicalNumber(n)) && !invented.includes(n)) invented.push(n);
  }
  return invented.length ? { ok: false, invented } : { ok: true, lines };
}
