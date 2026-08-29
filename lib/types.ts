import { z } from "zod";

/** Application lifecycle stages, in order. */
export const STAGES = [
  "saved",
  "applied",
  "screening",
  "interview",
  "case",
  "offer",
  "negotiation",
  "closed",
] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const ClosedReasonSchema = z.enum(["won", "lost", "withdrawn", "ghosted"]);
export type ClosedReason = z.infer<typeof ClosedReasonSchema>;

export const RoleFamilySchema = z.string().min(1); // e.g. "product-management"
export type RoleFamily = z.infer<typeof RoleFamilySchema>;

/** The structured extraction of a JD - parsed ONCE, reused everywhere (token rule #1). */
export const JdExtractSchema = z.object({
  company: z.string(),
  role: z.string(),
  roleFamily: RoleFamilySchema,
  sectorPath: z.array(z.string()).min(1), // e.g. ["IT","AI","Singapore"]
  skills: z.array(z.string()),
  keywords: z.array(z.string()),
  seniority: z.string().nullable(),
  visaNote: z.string().nullable(), // e.g. "EP sponsorship stated"
  location: z.string().nullable(),
});
export type JdExtract = z.infer<typeof JdExtractSchema>;

export const SectorNodeSchema = z.object({
  id: z.string(),
  path: z.array(z.string()).min(1),
  skills: z.record(z.string(), z.number()), // skill -> frequency across JDs
  companies: z.array(z.string()),
  titles: z.array(z.string()),
  jdCount: z.number().int().nonnegative(),
  summary: z.string(), // cached ~150-token summary (token rule #3)
});
export type SectorNode = z.infer<typeof SectorNodeSchema>;

export const BulletSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  roleFamily: RoleFamilySchema,
  text: z.string(),
  skills: z.array(z.string()).default([]),
});
export type Bullet = z.infer<typeof BulletSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  org: z.string(),
  dates: z.string().nullable(),
  role: z.string().nullable(),
  narrative: z.string(),
  outcomes: z.array(z.string()),
  skills: z.array(z.string()),
  sectorTags: z.array(z.string()),
  bullets: z.array(BulletSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export const MasterCvSchema = z.object({
  id: z.string(),
  roleFamily: RoleFamilySchema,
  summaryLine: z.string(),
  bulletIds: z.array(z.string()), // curated bullets, in order
  version: z.number().int().positive(),
});
export type MasterCv = z.infer<typeof MasterCvSchema>;

export const ApplicationSchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  sectorId: z.string().nullable(),
  stage: StageSchema,
  closedReason: ClosedReasonSchema.nullable(),
  jdExtract: JdExtractSchema.nullable(),
  cvVersionId: z.string().nullable(),
  referralContactId: z.string().nullable(),
  nextAction: z.string().nullable(),
  savedAt: z.string(), // ISO date
  appliedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const InteractionSchema = z.object({
  date: z.string(),
  channel: z.enum(["linkedin", "whatsapp", "email", "coffee", "call"]),
  summary: z.string(),
});
export type Interaction = z.infer<typeof InteractionSchema>;

export const WarmthSchema = z.enum(["cold", "warm", "hot"]);
export type Warmth = z.infer<typeof WarmthSchema>;

export const ContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  network: z.object({ name: z.string(), class: z.string().nullable(), campus: z.string().nullable() }).nullable(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  warmth: WarmthSchema,
  status: z.enum(["not-contacted", "awaiting-reply", "in-conversation", "met", "dormant"]),
  interests: z.array(z.string()),
  interactions: z.array(InteractionSchema), // newest first
  nextFollowup: z.string().nullable(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const SourcedJobSchema = z.object({
  id: z.string(),
  source: z.string(), // "adzuna" | "jooble" | "manual" | ...
  externalId: z.string().nullable(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  url: z.string().nullable(),
  postedAt: z.string().nullable(),
  score: z.number().nullable(),
  status: z.enum(["new", "shortlisted", "tracked", "dismissed"]),
});
export type SourcedJob = z.infer<typeof SourcedJobSchema>;

export const TokenLedgerEntrySchema = z.object({
  date: z.string(),
  module: z.string(), // "process-jd" | "tailor-cv" | ...
  model: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
});
export type TokenLedgerEntry = z.infer<typeof TokenLedgerEntrySchema>;

/** Normalize a skill/keyword for comparison: lowercase, trim, collapse spaces. */
export function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}
