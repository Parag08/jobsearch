import type { SourcedJob } from "../types";
import type { AtsKind } from "./ats";

/**
 * Pure mappers from each ATS's public board JSON to SourcedJob. Total like
 * mapAdzunaResult: missing fields degrade to ""/null, never throw. The
 * company is NOT read from the payload - it is the watchlist entry's name,
 * so a board's postings all attribute to the company the user declared.
 */

/** Greenhouse Job Board API: GET /v1/boards/{token}/jobs (subset we use). */
export interface GreenhouseJob {
  id?: string | number;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  updated_at?: string;
}

/** Lever Postings API: GET /v0/postings/{company}?mode=json (subset we use). */
export interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  categories?: { location?: string; team?: string };
  createdAt?: number; // ms since epoch
}

/** Ashby Posting API: GET /posting-api/job-board/{company} (subset we use). */
export interface AshbyJob {
  id?: string | number;
  title?: string;
  jobUrl?: string;
  location?: string;
  publishedAt?: string;
}

/** SmartRecruiters Posting API: GET /v1/companies/{company}/postings (subset we use). */
export interface SmartRecruitersPosting {
  id?: string | number;
  name?: string;
  ref?: string;
  location?: { city?: string; country?: string };
  releasedDate?: string;
}

export function mapGreenhouseJob(raw: GreenhouseJob, company: string): SourcedJob {
  return build("greenhouse", {
    externalId: idOf(raw.id),
    title: raw.title,
    company,
    location: raw.location?.name,
    url: raw.absolute_url,
    postedAt: isoDate(raw.updated_at),
  });
}

export function mapLeverPosting(raw: LeverPosting, company: string): SourcedJob {
  return build("lever", {
    externalId: idOf(raw.id),
    title: raw.text,
    company,
    location: raw.categories?.location,
    url: raw.hostedUrl,
    postedAt: typeof raw.createdAt === "number" ? isoDate(new Date(raw.createdAt).toISOString()) : null,
  });
}

export function mapAshbyJob(raw: AshbyJob, company: string): SourcedJob {
  return build("ashby", {
    externalId: idOf(raw.id),
    title: raw.title,
    company,
    location: raw.location,
    url: raw.jobUrl,
    postedAt: isoDate(raw.publishedAt),
  });
}

export function mapSmartRecruitersPosting(raw: SmartRecruitersPosting, company: string): SourcedJob {
  const parts = [raw.location?.city, raw.location?.country?.toUpperCase()].filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
  return build("smartrecruiters", {
    externalId: idOf(raw.id),
    title: raw.name,
    company,
    location: parts.length ? parts.join(", ") : null,
    url: raw.ref,
    postedAt: isoDate(raw.releasedDate),
  });
}

/**
 * Unwrap an ATS response envelope and map every posting. Greenhouse and
 * Ashby wrap in {jobs}, SmartRecruiters in {content}, Lever returns a bare
 * array. Malformed payloads yield [] - the caller reports, never crashes.
 */
export function mapBoardPayload(ats: AtsKind, payload: unknown, company: string): SourcedJob[] {
  switch (ats) {
    case "greenhouse":
      return listOf(payload, "jobs").map((j) => mapGreenhouseJob(j as GreenhouseJob, company));
    case "lever":
      return listOf(payload, null).map((p) => mapLeverPosting(p as LeverPosting, company));
    case "ashby":
      return listOf(payload, "jobs").map((j) => mapAshbyJob(j as AshbyJob, company));
    case "smartrecruiters":
      return listOf(payload, "content").map((p) =>
        mapSmartRecruitersPosting(p as SmartRecruitersPosting, company),
      );
    case "unknown":
      return [];
  }
}

// ---- helpers --------------------------------------------------------------------

interface Fields {
  externalId: string | null;
  title: string | undefined;
  company: string;
  location: string | undefined | null;
  url: string | undefined;
  postedAt: string | null;
}

function build(source: Exclude<AtsKind, "unknown">, f: Fields): SourcedJob {
  return {
    id: `${source}-${f.externalId ?? cryptoRandom()}`,
    source,
    externalId: f.externalId,
    title: f.title ?? "",
    company: f.company,
    location: f.location ?? null,
    url: f.url ?? null,
    postedAt: f.postedAt,
    score: null,
    status: "new",
  };
}

function idOf(id: string | number | undefined): string | null {
  return id != null ? String(id) : null;
}

/** First 10 chars of an ISO timestamp -> YYYY-MM-DD (domain convention), or null. */
function isoDate(ts: string | undefined): string | null {
  if (!ts || ts.length < 10) return null;
  const d = ts.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function listOf(payload: unknown, key: string | null): unknown[] {
  const list = key === null ? payload : isRecord(payload) ? payload[key] : undefined;
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}
