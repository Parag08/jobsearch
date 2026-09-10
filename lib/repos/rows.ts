import {
  ApplicationSchema,
  BulletSchema,
  ContactSchema,
  MasterCvSchema,
  ProjectSchema,
  SectorNodeSchema,
  SourcedJobSchema,
  TokenLedgerEntrySchema,
  type Application,
  type Bullet,
  type BulletVariant,
  type ClosedReason,
  type Contact,
  type Interaction,
  type JdExtract,
  type MasterCv,
  type Project,
  type SectorNode,
  type SourcedJob,
  type Stage,
  type TokenLedgerEntry,
  type Warmth,
} from "../types";
import type { CvDiff } from "../cv-diff";

/**
 * Row shapes mirror supabase/schema.sql exactly (snake_case; DB-defaulted
 * columns optional). Mappers here are the ONLY place snake<->camel lives.
 * Domain ids can be provisional (slug/synthetic) - inserts omit id and the
 * DB-generated uuid comes back on the returned row.
 */

export interface ProfileRow {
  user_id: string;
  display_name: string;
  target_geos: string[];
  role_families: string[];
  networks: unknown[];
  visa_context: string | null;
  premium_llm_budget_usd_month: number;
  contact_lines: string[];
  cv_extras: unknown[];
  created_at?: string;
}

export interface SectorRow {
  id: string;
  user_id: string;
  path: string[];
  role_family?: string | null;
  skills: Record<string, number>;
  companies: string[];
  titles: string[];
  jd_count: number;
  summary: string;
  updated_at?: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  org: string;
  dates: string | null;
  role: string | null;
  narrative: string;
  outcomes: string[];
  skills: string[];
  sector_tags: string[];
  created_at?: string;
}

export interface BulletRow {
  id: string;
  user_id: string;
  project_id: string;
  role_family: string;
  text: string;
  skills: string[];
  variants: BulletVariant[];
  strength: number;
}

export interface MasterCvRow {
  id: string;
  user_id: string;
  role_family: string;
  summary_line: string;
  bullet_ids: string[];
  version: number;
  updated_at?: string;
}

export interface ApplicationCvRow {
  id: string;
  user_id: string;
  master_cv_id: string;
  diff: CvDiff;
  bullet_ids: string[];
  summary_line: string;
  file_path: string | null;
  /** DESIGN.md section 2 "freeze on send": written once on the -> applied transition. */
  sent_snapshot?: SentSnapshot | null;
  sent_at?: string | null;
  created_at?: string;
}

/** The resolved text of a CV as it left the user's hands. text is null for a bullet the bank no longer holds. */
export interface SentSnapshot {
  bullets: { bulletId: string; text: string | null }[];
  summaryLine: string;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  company: string;
  careers_url: string;
  ats: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "unknown";
  token: string | null;
  active: boolean;
  added_at: string;
  created_at?: string;
}

export interface StoryRow {
  id: string;
  user_id: string;
  project_id: string;
  bullet_id: string | null;
  situation: string;
  task: string;
  action: string;
  result: string;
  competencies: string[];
  numbers: string[];
  captured_at: string;
}

export interface ApplicationRow {
  id: string;
  user_id: string;
  company: string;
  role: string;
  sector_id: string | null;
  stage: Stage;
  closed_reason: ClosedReason | null;
  jd_extract: JdExtract | null;
  jd_raw: string | null;
  cv_id: string | null;
  referral_contact_id: string | null;
  next_action: string | null;
  saved_at: string;
  applied_at: string | null;
  updated_at: string;
}

export interface ContactRow {
  id: string;
  user_id: string;
  name: string;
  network: { name: string; class: string | null; campus: string | null } | null;
  company: string | null;
  role: string | null;
  location: string | null;
  warmth: Warmth;
  status: Contact["status"];
  interests: string[];
  next_followup: string | null;
  rolling_summary: string;
  created_at?: string;
}

export interface InteractionRow {
  id: string;
  user_id: string;
  contact_id: string;
  date: string;
  channel: Interaction["channel"];
  summary: string;
  raw_text: string | null;
}

export interface SourcedJobRow {
  id: string;
  user_id: string;
  source: string;
  external_id: string | null;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  posted_at: string | null;
  score: number | null;
  status: SourcedJob["status"];
  created_at?: string;
}

export interface BriefItem {
  title: string;
  why: string;
  url: string | null;
}

export interface BriefRow {
  id: string;
  user_id: string;
  date: string;
  items: BriefItem[];
}

export interface TokenLedgerRow {
  id?: string | number;
  user_id: string;
  date: string;
  module: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
}

export interface RowMap {
  profiles: ProfileRow;
  sectors: SectorRow;
  projects: ProjectRow;
  bullets: BulletRow;
  master_cvs: MasterCvRow;
  application_cvs: ApplicationCvRow;
  applications: ApplicationRow;
  contacts: ContactRow;
  interactions: InteractionRow;
  sourced_jobs: SourcedJobRow;
  briefs: BriefRow;
  token_ledger: TokenLedgerRow;
  watchlist: WatchlistRow;
  stories: StoryRow;
}
export type TableName = keyof RowMap;
export type RowOf<T extends TableName> = RowMap[T];

// ---- domain shapes that only exist at the DB edge (no module logic on them) --

export interface Profile {
  userId: string;
  displayName: string;
  targetGeos: string[];
  roleFamilies: string[];
  networks: unknown[];
  visaContext: string | null;
  premiumLlmBudgetUsdMonth: number;
  /** CV header lines (LinkedIn, emails, phones) - rendered, never matched on. */
  contactLines: string[];
  /** The CV's closing blocks: languages, skills, technologies, interests. */
  cvExtras: unknown[];
}

export interface Brief {
  date: string;
  items: BriefItem[];
}

/** A persisted tailored CV (cv-diff's ApplicationCv is the pure compute shape). */
export interface StoredApplicationCv {
  id: string;
  masterCvId: string;
  diff: CvDiff;
  bulletIds: string[];
  summaryLine: string;
  filePath: string | null;
  sentSnapshot?: SentSnapshot | null;
  sentAt?: string | null;
}

// ---- mappers: row -> domain (zod-parsed at the boundary) ----------------------

export function toSectorNode(r: SectorRow): SectorNode {
  return SectorNodeSchema.parse({
    id: r.id,
    path: r.path,
    skills: r.skills,
    companies: r.companies,
    titles: r.titles,
    jdCount: r.jd_count,
    summary: r.summary,
  });
}

export function toApplication(r: ApplicationRow): Application {
  return ApplicationSchema.parse({
    id: r.id,
    company: r.company,
    role: r.role,
    sectorId: r.sector_id,
    stage: r.stage,
    closedReason: r.closed_reason,
    jdExtract: r.jd_extract,
    cvVersionId: r.cv_id,
    referralContactId: r.referral_contact_id,
    nextAction: r.next_action,
    savedAt: r.saved_at,
    appliedAt: r.applied_at,
    updatedAt: r.updated_at,
  });
}

export function toBullet(r: BulletRow): Bullet {
  return BulletSchema.parse({
    id: r.id,
    projectId: r.project_id,
    roleFamily: r.role_family,
    text: r.text,
    skills: r.skills,
    variants: r.variants,
    strength: r.strength,
  });
}

export function toProject(r: ProjectRow, bullets: Bullet[]): Project {
  return ProjectSchema.parse({
    id: r.id,
    name: r.name,
    org: r.org,
    dates: r.dates,
    role: r.role,
    narrative: r.narrative,
    outcomes: r.outcomes,
    skills: r.skills,
    sectorTags: r.sector_tags,
    bullets,
  });
}

export function toMasterCv(r: MasterCvRow): MasterCv {
  return MasterCvSchema.parse({
    id: r.id,
    roleFamily: r.role_family,
    summaryLine: r.summary_line,
    bulletIds: r.bullet_ids,
    version: r.version,
  });
}

export function toStoredApplicationCv(r: ApplicationCvRow): StoredApplicationCv {
  return {
    id: r.id,
    masterCvId: r.master_cv_id,
    diff: r.diff,
    bulletIds: r.bullet_ids,
    summaryLine: r.summary_line,
    filePath: r.file_path,
    sentSnapshot: r.sent_snapshot ?? null,
    sentAt: r.sent_at ?? null,
  };
}

export function toInteraction(r: InteractionRow): Interaction {
  return { date: r.date, channel: r.channel, summary: r.summary };
}

export function toContact(r: ContactRow, interactions: Interaction[] = []): Contact {
  return ContactSchema.parse({
    id: r.id,
    name: r.name,
    network: r.network,
    company: r.company,
    role: r.role,
    location: r.location,
    warmth: r.warmth,
    status: r.status,
    interests: r.interests,
    interactions,
    nextFollowup: r.next_followup,
  });
}

export function toSourcedJob(r: SourcedJobRow): SourcedJob {
  return SourcedJobSchema.parse({
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    title: r.title,
    company: r.company,
    location: r.location,
    url: r.url,
    postedAt: r.posted_at,
    score: r.score,
    status: r.status,
  });
}

export function toTokenLedgerEntry(r: TokenLedgerRow): TokenLedgerEntry {
  return TokenLedgerEntrySchema.parse({
    date: r.date,
    module: r.module,
    model: r.model,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
  });
}

export function toBrief(r: BriefRow): Brief {
  return { date: r.date, items: r.items };
}

export function toProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    targetGeos: r.target_geos,
    roleFamilies: r.role_families,
    networks: r.networks,
    visaContext: r.visa_context,
    premiumLlmBudgetUsdMonth: r.premium_llm_budget_usd_month,
    contactLines: r.contact_lines,
    cvExtras: r.cv_extras,
  };
}

// ---- mappers: domain -> row (inserts omit id: the DB generates uuids) ---------

export function sectorRow(userId: string, node: SectorNode): Omit<SectorRow, "id"> {
  return {
    user_id: userId,
    path: node.path,
    skills: node.skills,
    companies: node.companies,
    titles: node.titles,
    jd_count: node.jdCount,
    summary: node.summary,
  };
}

export function applicationPatch(
  app: Omit<Application, "id">,
): Omit<ApplicationRow, "id" | "user_id" | "jd_raw"> {
  return {
    company: app.company,
    role: app.role,
    sector_id: app.sectorId,
    stage: app.stage,
    closed_reason: app.closedReason,
    jd_extract: app.jdExtract,
    cv_id: app.cvVersionId,
    referral_contact_id: app.referralContactId,
    next_action: app.nextAction,
    saved_at: app.savedAt,
    applied_at: app.appliedAt,
    updated_at: app.updatedAt,
  };
}

export function applicationRow(
  userId: string,
  app: Omit<Application, "id">,
  jdRaw: string | null = null,
): Omit<ApplicationRow, "id"> {
  return { user_id: userId, jd_raw: jdRaw, ...applicationPatch(app) };
}

export function projectRow(
  userId: string,
  p: Omit<Project, "id" | "bullets">,
): Omit<ProjectRow, "id"> {
  return {
    user_id: userId,
    name: p.name,
    org: p.org,
    dates: p.dates,
    role: p.role,
    narrative: p.narrative,
    outcomes: p.outcomes,
    skills: p.skills,
    sector_tags: p.sectorTags,
  };
}

export function bulletRow(
  userId: string,
  projectId: string,
  b: Omit<Bullet, "id" | "projectId">,
): Omit<BulletRow, "id"> {
  return {
    user_id: userId,
    project_id: projectId,
    role_family: b.roleFamily,
    text: b.text,
    skills: b.skills,
    variants: b.variants ?? [],
    strength: b.strength ?? 3,
  };
}

export function masterCvRow(userId: string, cv: Omit<MasterCv, "id">): Omit<MasterCvRow, "id"> {
  return {
    user_id: userId,
    role_family: cv.roleFamily,
    summary_line: cv.summaryLine,
    bullet_ids: cv.bulletIds,
    version: cv.version,
  };
}

export function applicationCvRow(
  userId: string,
  cv: Omit<StoredApplicationCv, "id">,
): Omit<ApplicationCvRow, "id"> {
  return {
    user_id: userId,
    master_cv_id: cv.masterCvId,
    diff: cv.diff,
    bullet_ids: cv.bulletIds,
    summary_line: cv.summaryLine,
    file_path: cv.filePath,
  };
}

export function contactPatch(
  c: Omit<Contact, "id" | "interactions">,
): Omit<ContactRow, "id" | "user_id" | "rolling_summary"> {
  return {
    name: c.name,
    network: c.network,
    company: c.company,
    role: c.role,
    location: c.location,
    warmth: c.warmth,
    status: c.status,
    interests: c.interests,
    next_followup: c.nextFollowup,
  };
}

export function contactRow(
  userId: string,
  c: Omit<Contact, "id" | "interactions">,
): Omit<ContactRow, "id"> {
  return { user_id: userId, rolling_summary: "", ...contactPatch(c) };
}

export function interactionRow(
  userId: string,
  contactId: string,
  i: Interaction,
  rawText: string | null = null,
): Omit<InteractionRow, "id"> {
  return {
    user_id: userId,
    contact_id: contactId,
    date: i.date,
    channel: i.channel,
    summary: i.summary,
    raw_text: rawText,
  };
}

export function sourcedJobRow(userId: string, j: Omit<SourcedJob, "id">): Omit<SourcedJobRow, "id"> {
  return {
    user_id: userId,
    source: j.source,
    external_id: j.externalId,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    posted_at: j.postedAt,
    score: j.score,
    status: j.status,
  };
}

export function briefRow(userId: string, b: Brief): Omit<BriefRow, "id"> {
  return { user_id: userId, date: b.date, items: b.items };
}

export function tokenLedgerRow(userId: string, e: TokenLedgerEntry): TokenLedgerRow {
  return {
    user_id: userId,
    date: e.date,
    module: e.module,
    model: e.model,
    tokens_in: e.tokensIn,
    tokens_out: e.tokensOut,
  };
}

export function profileRow(p: Profile): ProfileRow {
  return {
    user_id: p.userId,
    display_name: p.displayName,
    target_geos: p.targetGeos,
    role_families: p.roleFamilies,
    networks: p.networks,
    visa_context: p.visaContext,
    premium_llm_budget_usd_month: p.premiumLlmBudgetUsdMonth,
    contact_lines: p.contactLines,
    cv_extras: p.cvExtras,
  };
}
