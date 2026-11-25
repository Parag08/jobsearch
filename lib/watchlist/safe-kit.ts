import { z } from "zod";
import { companyWebsite } from "./daily";

export const Evidence = z.enum(["discovery", "prioritization", "delivery", "measurement", "experimentation", "stakeholders", "operations", "technical-design"]);
export type EvidenceCode = z.infer<typeof Evidence>;

export const EVIDENCE_TEXT: Record<EvidenceCode, string> = {
  discovery: "Conducted product or user discovery to identify needs and validate problems.",
  prioritization: "Prioritized a roadmap by weighing customer needs and delivery trade-offs.",
  delivery: "Coordinated cross-functional delivery from planning through launch.",
  measurement: "Defined success measures and used the results to guide product decisions.",
  experimentation: "Designed and evaluated experiments to test product changes.",
  stakeholders: "Aligned stakeholders on decisions, trade-offs and next steps.",
  operations: "Improved an operating process by identifying and removing friction.",
  "technical-design": "Partnered on technical design and evaluated implementation trade-offs.",
};

export const SafeDraft = z.strictObject({ evidence: Evidence, tone: z.enum(["direct", "context-first"]) });
export type SafeDraft = z.infer<typeof SafeDraft>;
export const Prompt = z.enum(["related-experience", "approach-to-work", "work-highlight"]);
export const PROMPTS: Record<z.infer<typeof Prompt>, string> = {
  "related-experience": "What relevant experience would you bring to this role?",
  "approach-to-work": "How do you approach your work?",
  "work-highlight": "Describe an example of relevant work.",
};
export const AnswerRequest = z.strictObject({ prompt: Prompt, limit: z.number().int().min(1).max(10000), unit: z.enum(["words", "characters"]) });
export type AnswerRequest = z.infer<typeof AnswerRequest>;

export const ResearchFact = z.strictObject({
  kind: z.enum(["product-documentation", "company-overview", "public-announcement", "platform-capabilities"]),
  url: z.string().max(300),
  checkedAt: z.iso.date(),
});
export type ResearchFact = z.infer<typeof ResearchFact>;

export const RESEARCH_LABELS: Record<ResearchFact["kind"], string> = {
  "product-documentation": "Official product documentation",
  "company-overview": "Official company overview",
  "public-announcement": "Public company announcement",
  "platform-capabilities": "Official platform capabilities",
};

export const RankReview = z.strictObject({
  evidence: z.array(Evidence).min(1).max(2).refine((xs) => new Set(xs).size === xs.length),
  uncertainty: z.enum(["unverified-requirement", "scope", "location", "eligibility", "seniority"]),
});
export type RankReview = z.infer<typeof RankReview>;
export const UNCERTAINTY: Record<RankReview["uncertainty"], string> = {
  "unverified-requirement": "A requirement has not been verified.",
  scope: "The exact scope and ownership are unclear.",
  location: "Working location and policy are unclear.",
  eligibility: "Eligibility is not stated or independently verified.",
  seniority: "The expected seniority or experience level is unclear.",
};

const DraftState = z.strictObject({ draft: SafeDraft.nullable(), approved: z.boolean() });
export const Submission = z.strictObject({
  date: z.iso.date(),
  materials: z.enum(["reviewed", "different"]),
  version: z.number().int().nonnegative().nullable(),
});
export type Submission = z.infer<typeof Submission>;
export const ConfirmSubmission = z.strictObject({
  date: z.iso.date(), materials: Submission.shape.materials, revision: z.number().int().nonnegative(), confirmedByUser: z.literal(true),
});
export type ConfirmSubmission = z.infer<typeof ConfirmSubmission>;

export const SafeKit = z.strictObject({
  formatVersion: z.literal(1),
  jobId: z.string().min(1).max(100),
  location: z.string().max(250).nullable(),
  postedAt: z.iso.date().nullable(),
  checkedAt: z.iso.datetime().nullable(),
  evidence: z.array(Evidence).max(3),
  cvReviewed: z.boolean(),
  letter: DraftState.nullable(),
  answer: DraftState.extend({ request: AnswerRequest }).nullable(),
  submission: Submission.nullable(),
});
export type SafeKit = z.infer<typeof SafeKit>;

export function chooseEvidence(evidence: readonly EvidenceCode[], title: string, preferred: readonly EvidenceCode[] = []): EvidenceCode[] {
  const priority = /design|engineer|technical/i.test(title) ? ["technical-design", "delivery"] :
    /growth|analytics/i.test(title) ? ["measurement", "experimentation"] :
    /operation/i.test(title) ? ["operations", "delivery"] : ["discovery", "prioritization"];
  const order = [...preferred, ...priority, ...Evidence.options];
  return [...new Set(order)].filter((entry): entry is EvidenceCode => evidence.includes(entry as EvidenceCode)).slice(0, 3);
}

const APPROACH: Record<EvidenceCode, string> = {
  discovery: "use product or user discovery to identify needs and validate problems",
  prioritization: "weigh customer needs and delivery trade-offs when prioritizing a roadmap",
  delivery: "coordinate across functions from planning through launch",
  measurement: "define success measures and use the results to guide product decisions",
  experimentation: "design and evaluate experiments to test product changes",
  stakeholders: "align stakeholders on decisions, trade-offs and next steps",
  operations: "identify and remove friction to improve operating processes",
  "technical-design": "partner on technical design and evaluate implementation trade-offs",
};

export function draftText(draft: SafeDraft, prompt: "letter" | AnswerRequest["prompt"]) {
  const evidence = "I " + EVIDENCE_TEXT[draft.evidence].replace(/^./, (c) => c.toLowerCase());
  if (prompt === "letter") {
    const opening = "I’m interested in discussing how my experience could support this role.";
    return draft.tone === "context-first" ? opening + "\n\n" + evidence : evidence + "\n\n" + opening;
  }
  if (prompt === "approach-to-work") {
    return (draft.tone === "direct" ? "I approach the work by making the next step explicit: I " : "My approach depends on the task. For this one, I ") + APPROACH[draft.evidence] + ".";
  }
  if (prompt === "work-highlight") return (draft.tone === "direct" ? "One example: " : "One example from my previous work: ") + evidence;
  return (draft.tone === "context-first" ? "Relevant experience I would bring: " : "") + evidence;
}

export function fitsAnswer(draft: string, request: AnswerRequest) {
  const count = request.unit === "words" ? draft.trim().split(/\s+/).filter(Boolean).length : Array.from(draft).length;
  return count <= request.limit;
}

export function sourceForCompany(raw: string, website: string | null) {
  if (!website || raw.length > 300) return null;
  try {
    const u = new URL(raw);
    const allowed = new URL(website);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash ||
      companyWebsite(raw) !== companyWebsite(website) || u.hostname.replace(/^www\./, "") !== allowed.hostname.replace(/^www\./, "")) return null;
    if (u.pathname !== "/" &&
      !/^\/(?:docs|documentation|products?|solutions|platform|about|company|press|news)(?:\/[a-z][a-z0-9-]{0,48}){0,3}\/?$/i.test(u.pathname)) return null;
    if (/(?:^|\/|-)(?:team|people|author|profile|user|staff|employee|directory|contacts?)(?:\/|-|$)/i.test(u.pathname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function currentResearch(facts: unknown, website: string | null) {
  const result = z.array(ResearchFact).max(3).safeParse(facts);
  return result.success ? result.data.filter((f) => sourceForCompany(f.url, website) !== null) : [];
}
