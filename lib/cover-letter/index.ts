import { z } from "zod";
import type { Contact, JdExtract } from "../types";
import type { Requirement } from "../editorial/gaps";

/**
 * Cover letter from the honest gaps (DESIGN §2 "The cover letter", ROADMAP Now #4).
 * Code owns everything it can: the date, salutation, the fixed opener of ¶3, the
 * logistics and close, the variant chosen for the recurring ¶3 argument, and the
 * voice/honesty checks. The model writes only the three paragraphs. Pure - no I/O.
 */

/** The paragraph-scale variant bank (DESIGN: "stored and selected, never regenerated"). DATA. */
export const LetterBankSchema = z.object({
  signOff: z.string(),
  usefulOpener: z.string(),
  close: z.string(),
  logistics: z.string(),
  spineAnchor: z.string(),
  implementationTriads: z.array(z.string()).min(1),
  /** Body word range the sent letters fall in; absent = length not checked. */
  wordRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
});
export type LetterBank = z.infer<typeof LetterBankSchema>;

export function parseLetterBank(json: unknown): LetterBank {
  return LetterBankSchema.parse(json);
}

/** Deterministic per key, so regenerating a company's letter keeps the same argument. */
export function pickVariant(options: string[], key: string): string {
  if (options.length === 0) return "";
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length]!;
}

export interface LetterBriefInput {
  jd: JdExtract;
  gaps: Requirement[];
  /** Resolved texts of the bullets on the tailored page, so the letter amplifies rather than repeats. */
  cvBullets: string[];
  contacts: Contact[];
  /** The firm's inconvenient detail - from the user. The one thing the system must never invent. */
  firmDetail: string;
  bank: LetterBank;
  applicantName: string;
}

export interface LetterBrief {
  company: string;
  role: string;
  gaps: string[];
  cvBullets: string[];
  namedContacts: string[];
  firmDetail: string;
  implementationTriad: string;
  bank: LetterBank;
  applicantName: string;
}

/** Statuses that mean a real conversation happened, so the person is evidence. */
const SPOKE_WITH: ReadonlySet<Contact["status"]> = new Set(["in-conversation", "met"]);
const MAX_BULLETS = 8;

export function buildLetterBrief(input: LetterBriefInput): LetterBrief | { needs: ["firmDetail"] } {
  const firmDetail = input.firmDetail.trim();
  if (!firmDetail) return { needs: ["firmDetail"] };
  const company = input.jd.company.toLowerCase().trim();
  return {
    company: input.jd.company,
    role: input.jd.role,
    gaps: input.gaps.map((g) => g.term),
    cvBullets: input.cvBullets.slice(0, MAX_BULLETS),
    namedContacts: input.contacts
      .filter((c) => SPOKE_WITH.has(c.status) && (c.company ?? "").toLowerCase().trim() === company)
      .map((c) => (c.role ? `${c.name} (${c.role})` : c.name)),
    firmDetail,
    implementationTriad: pickVariant(input.bank.implementationTriads, input.jd.company),
    bank: input.bank,
    applicantName: input.applicantName,
  };
}

/** The premium-tier prompt: compact facts, never a raw document (token rule #3). */
export function buildCoverLetterPrompt(b: LetterBrief): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)");
  return [
    `Write the body of a cover letter from ${b.applicantName} for the role "${b.role}" at ${b.company}.`,
    "",
    "Output exactly three paragraphs separated by one blank line. No salutation, no sign-off, no headings, no bullets.",
    b.bank.wordRange ? `Roughly ${b.bank.wordRange[0]}-${b.bank.wordRange[1]} words in total.` : "About one page.",
    "",
    "Paragraph 1 - the career spine: compress the career into one paragraph and end it with this sentence, verbatim:",
    `"${b.bank.spineAnchor}"`,
    "Paragraph 2 - why this firm: open by admitting scepticism of marketing, then earn the interest with the firm detail below, and close by turning it into a want.",
    "Paragraph 3 - where I would be useful: begin with this sentence, verbatim:",
    `"${b.bank.usefulOpener}"`,
    `Then argue that having lived on the implementation side, the applicant knows how good recommendations die: ${b.implementationTriad}.`,
    "Where it fits, address the honest gaps below as things to learn, never as experience the applicant has.",
    `End paragraph 3 with these two sentences, verbatim: "${b.bank.logistics}" "${b.bank.close}"`,
    "",
    "Voice rules - follow all of them:",
    "- No contractions (I have, it is, do not).",
    "- British spelling.",
    "- Almost no numbers: the CV carries the metrics, the letter carries the narrative. Do not repeat figures from the CV.",
    "- No superlatives or enthusiasm words (passionate, excited, thrilled, world-class).",
    "- Plain declaratives; weight comes from specificity, not adjectives.",
    "",
    "Honesty rules:",
    "- Do not state any fact about the firm other than the firm detail given here.",
    "- Claim no skill, tool, employer or achievement that is not in the CV lines below.",
    "- Name a person only if listed under people spoken with.",
    "",
    `Firm detail (from the applicant's own research):\n${b.firmDetail}`,
    "",
    `CV lines already on the page (amplify the story, do not repeat them):\n${list(b.cvBullets)}`,
    "",
    `Honest gaps - requirements the CV cannot evidence:\n${list(b.gaps)}`,
    "",
    `People spoken with at ${b.company}:\n${list(b.namedContacts)}`,
  ].join("\n");
}

const SALUTATION = /^dear\b/i;
const SIGN_OFF = /^(yours (sincerely|faithfully)|kind regards|best regards|sincerely)\b/i;

/** Paragraphs of a model reply; drops a salutation or sign-off it added despite instructions. */
export function splitParagraphs(text: string): string[] {
  const paras = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const out = paras.filter((p) => !(SALUTATION.test(p) && p.length < 120));
  const signAt = out.findIndex((p) => SIGN_OFF.test(p));
  return signAt === -1 ? out : out.slice(0, signAt);
}

export type LetterIssueKind = "contraction" | "banned-word" | "number" | "paragraphs" | "length";

export interface LetterIssue {
  kind: LetterIssueKind;
  detail: string;
}

const CONTRACTION = /\b[A-Za-z]+(?:'|’)(?:m|re|s|ve|ll|d|t)\b/g;
const BANNED = /\b(passionate|passion|excited|exciting|thrilled|world-class|best-in-class|incredible|amazing)\b/gi;
const NUMBER = /\d+(?:[.,]\d+)*%?/g;

/**
 * Voice and honesty checks (DESIGN §2 "Voice rules"). Numbers are allowed only
 * when they appear in text the applicant supplied (logistics, firm detail), so a
 * figure the model invented or lifted from the CV is flagged. "It's" counts as a
 * contraction; a possessive "Bain's" does too by this rule - the letters avoid both.
 */
export function checkLetter(
  text: string,
  opts: { allowedText: string; wordRange?: [number, number] },
): { paragraphs: string[]; issues: LetterIssue[] } {
  const paragraphs = splitParagraphs(text);
  const body = paragraphs.join(" ");
  const issues: LetterIssue[] = [];

  const contractions = [...new Set(body.match(CONTRACTION) ?? [])].filter((w) => !/(?:'|’)s$/.test(w) || /^(it|that|there|what|he|she|who|here)/i.test(w));
  if (contractions.length) issues.push({ kind: "contraction", detail: contractions.join(", ") });

  const banned = [...new Set((body.match(BANNED) ?? []).map((w) => w.toLowerCase()))];
  if (banned.length) issues.push({ kind: "banned-word", detail: banned.join(", ") });

  const allowed = new Set(opts.allowedText.match(NUMBER) ?? []);
  const numbers = [...new Set(body.match(NUMBER) ?? [])].filter((n) => !allowed.has(n));
  if (numbers.length) issues.push({ kind: "number", detail: numbers.join(", ") });

  if (paragraphs.length !== 3) issues.push({ kind: "paragraphs", detail: `${paragraphs.length} paragraphs, not 3` });

  const words = body.split(/\s+/).filter(Boolean).length;
  const range = opts.wordRange;
  if (range && paragraphs.length === 3 && (words < range[0] || words > range[1])) {
    issues.push({ kind: "length", detail: `${words} words, aim for ${range[0]}-${range[1]}` });
  }

  return { paragraphs, issues };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-09-07" -> "7 September 2026", the sent letters' form. */
export function letterDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export interface AssembleInput {
  date: string;
  /** A named individual; empty when none is known. */
  recipient: string;
  /** Used only when no individual is known ("Tech Insights Group Recruitment Team"). */
  teamName: string;
  paragraphs: string[];
  bank: LetterBank;
  applicantName: string;
}

export function assembleLetter(a: AssembleInput): string {
  const to = a.recipient.trim() || a.teamName.trim();
  return [a.date, `Dear ${to},`, ...a.paragraphs, `${a.bank.signOff}\n${a.applicantName}`].join("\n\n");
}
