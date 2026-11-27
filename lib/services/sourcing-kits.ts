import { z } from "zod";
import { applyFollowUpDaysFromEnv, followUpAfterApplying } from "../apply/follow-up";
import { findApplicationByExternalRef } from "../repos/applications";
import { oneOrNull, type DbClient } from "../repos/db";
import type { ApplicationRow } from "../repos/rows";
import { getSafeEvidence, getSourcingCompany, publicCompanyName } from "../repos/sourcing";
import { norm } from "../types";
import { boardForRole, loadDailySourcing } from "./daily-sourcing";
import { envFor } from "./settings";
import { safeRoleLabel } from "../watchlist/daily";
import { sourcedRef } from "./save-to-pipeline";
import {
  AnswerRequest, ConfirmSubmission, RankReview, ResearchFact, SafeDraft, SafeKit,
  chooseEvidence, draftText, fitsAnswer, sourceForCompany, type EvidenceCode, type Submission,
} from "../watchlist/safe-kit";

export async function prepareSourcingBatch(db: DbClient, userId: string, date: string) {
  const source = await loadDailySourcing(db, userId);
  const ids: string[] = [];
  const failedRoleIds: string[] = [];
  for (const job of source.picked) {
    try {
      const company = source.companyByName.get(norm(job.company));
      if (!company?.active || !publicCompanyName(company.name) || !safeRoleLabel(job.title)) throw new Error("Invalid role");
      const last = boardForRole(source.configured, job)?.lastSuccessAt;
      const kit: SafeKit = {
        formatVersion: 1, jobId: job.id, location: job.location,
        postedAt: z.iso.date().safeParse(job.postedAt).data ?? null,
        checkedAt: last && Number.isFinite(Date.parse(last)) ? new Date(last).toISOString() : null,
        evidence: chooseEvidence(source.evidence, job.title, source.reviews[job.id]?.evidence), cvReviewed: false,
        letter: null, answer: null, submission: null,
      };
      const externalRef = sourcedRef(job.id);
      const existing = await findApplicationByExternalRef(db, userId, externalRef);
      if (existing) { ids.push(existing.id); continue; }
      const { data, error } = await db.from("applications").insert({
        user_id: userId, company_id: company.id, company: company.name, role: job.title, stage: "saved",
        sector_id: null, closed_reason: null, jd_extract: null, jd_raw: null, cv_id: null, referral_contact_id: null,
        next_action: null, saved_at: date, applied_at: null, updated_at: date, external_ref: externalRef,
        apply_url: job.url, sourcing_kit: kit, sourcing_revision: 0,
      }).select().single();
      if (error || !data) {
        const concurrent = await findApplicationByExternalRef(db, userId, externalRef);
        if (!concurrent) throw new Error("Could not save kit");
        ids.push(concurrent.id);
      } else ids.push(data.id);
    } catch {
      failedRoleIds.push(job.id);
    }
  }
  return { applicationIds: ids, failedRoleIds };
}

export async function getSourcingKit(db: DbClient, userId: string, id: string) {
  const row = await oneOrNull(db.from("applications").select().eq("user_id", userId).eq("id", id).maybeSingle(),
    "applications", "safe kit");
  if (!row || row.sourcing_kit == null) return null;
  return { row, value: SafeKit.parse(row.sourcing_kit), revision: row.sourcing_revision ?? 0 };
}
type KitRecord = NonNullable<Awaited<ReturnType<typeof getSourcingKit>>>;

export function usableKit(kit: SafeKit, verified: readonly EvidenceCode[]): SafeKit {
  if (kit.submission?.materials === "reviewed") return kit;
  const evidence = kit.evidence.filter((code) => verified.includes(code));
  const letter = kit.letter?.draft && !evidence.includes(kit.letter.draft.evidence)
    ? { draft: null, approved: false } : kit.letter;
  const answer = kit.answer?.draft && !evidence.includes(kit.answer.draft.evidence)
    ? { ...kit.answer, draft: null, approved: false } : kit.answer;
  return { ...kit, evidence, letter, answer, cvReviewed: kit.cvReviewed && evidence.length === kit.evidence.length };
}

export async function getUsableSourcingKit(db: DbClient, userId: string, id: string) {
  const record = await getSourcingKit(db, userId, id);
  return record && { ...record, value: usableKit(record.value, await getSafeEvidence(db, userId)) };
}

async function writeKit(db: DbClient, userId: string, record: KitRecord, kit: SafeKit, patch: Partial<ApplicationRow> = {}) {
  return oneOrNull(db.from("applications").update({
    ...patch, sourcing_kit: kit, sourcing_revision: record.revision + 1,
  }).eq("user_id", userId).eq("id", record.row.id).eq("sourcing_revision", record.revision).eq("stage", "saved")
    .select().maybeSingle(), "applications", "update safe kit");
}

async function editKit(db: DbClient, userId: string, id: string, edit: (kit: SafeKit) => SafeKit, revision?: number) {
  const current = await getSourcingKit(db, userId, id);
  if (!current || current.row.stage !== "saved" || current.value.submission) throw new Error("Only an owned Saved kit can change.");
  if (revision !== undefined && current.revision !== revision) throw new Error("This kit changed. Reload it before writing.");
  const updated = edit(current.value);
  if (JSON.stringify(updated) === JSON.stringify(current.value)) return current.revision;
  if (!await writeKit(db, userId, current, updated)) throw new Error("This kit changed. Reload it and try again.");
  return current.revision + 1;
}

export async function setSafeKitEvidence(db: DbClient, userId: string, id: string, codes: EvidenceCode[], reviewed: boolean, revision?: number) {
  const currentEvidence = await getSafeEvidence(db, userId);
  if (codes.length > 3 || codes.some((code) => !currentEvidence.includes(code))) throw new Error("Select only claims you verified in CV & evidence.");
  const evidence = [...new Set(codes)];
  return editKit(db, userId, id, (k) => {
    const sameContent = k.evidence.length === evidence.length && evidence.every((code) => k.evidence.includes(code));
    return {
      ...k, evidence: sameContent ? k.evidence : evidence, cvReviewed: sameContent && evidence.length > 0 && reviewed,
      letter: sameContent || !k.letter ? k.letter : { draft: null, approved: false },
      answer: sameContent || !k.answer ? k.answer : { request: k.answer.request, draft: null, approved: false },
    };
  }, revision);
}

export async function requestKitDraft(db: DbClient, userId: string, id: string, section: "letter" | "answer", request?: AnswerRequest) {
  const state = { draft: null, approved: false };
  const parsed = section === "answer" ? AnswerRequest.parse(request) : null;
  const verified = await getSafeEvidence(db, userId);
  return editKit(db, userId, id, (kit) => {
    if (!kit.evidence.some((code) => verified.includes(code))) throw new Error("Add verified CV evidence first.");
    return section === "letter" ? { ...kit, letter: kit.letter ?? state } :
      { ...kit, answer: kit.answer && JSON.stringify(kit.answer.request) === JSON.stringify(parsed)
        ? kit.answer : { ...state, request: parsed! } };
  });
}

export async function saveKitDraft(db: DbClient, userId: string, id: string, section: "letter" | "answer", input: SafeDraft, revision: number, confirmedByUser = false) {
  const draft = SafeDraft.parse(input);
  const verified = await getSafeEvidence(db, userId);
  return editKit(db, userId, id, (kit) => {
    const entry = kit[section];
    if (!entry || !kit.evidence.includes(draft.evidence) || !verified.includes(draft.evidence)) throw new Error("Use one of the kit’s currently verified evidence codes for an explicitly requested draft.");
    if (entry.draft && entry.draft.evidence === draft.evidence && entry.draft.tone === draft.tone) return kit;
    if (entry.approved && !confirmedByUser) throw new Error("Get explicit user confirmation before replacing a reviewed draft.");
    return { ...kit, [section]: { ...entry, draft, approved: false } };
  }, revision);
}

export async function approveKitDraft(db: DbClient, userId: string, id: string, section: "letter" | "answer", revision: number) {
  const verified = await getSafeEvidence(db, userId);
  return editKit(db, userId, id, (kit) => {
    const entry = kit[section];
    if (!entry?.draft) throw new Error("There is no draft to review.");
    if (!verified.includes(entry.draft.evidence)) throw new Error("This draft relies on an unverified claim.");
    if (section === "answer" && kit.answer && !fitsAnswer(draftText(entry.draft, kit.answer.request.prompt), kit.answer.request)) {
      throw new Error("Shorten the answer before approving it.");
    }
    return { ...kit, [section]: { ...entry, approved: true } };
  }, revision);
}

export async function confirmSourcingSubmission(
  db: DbClient, userId: string, id: string, input: ConfirmSubmission, today: string, followUpDays?: number,
): Promise<Submission> {
  const { date, materials, revision } = ConfirmSubmission.parse(input);
  const current = await getSourcingKit(db, userId, id);
  if (!current) throw new Error("Saved kit not found.");
  if (current.value.submission) return current.value.submission;
  if (date > today) throw new Error("Use the date you submitted, not a future date.");
  if (current.row.stage !== "saved" || current.revision !== revision) throw new Error("This kit changed. Review it and try again.");
  const verified = await getSafeEvidence(db, userId);
  if (materials === "reviewed" && (!current.value.cvReviewed || !current.value.evidence.length ||
    current.value.evidence.some((code) => !verified.includes(code)))) {
    throw new Error("Review the exact safe CV content before choosing this option, or select different materials.");
  }
  const submission = { date, materials, version: materials === "reviewed" ? revision : null };
  const next = current.row.next_action || (followUpDays ? followUpAfterApplying(date, followUpDays) : null);
  if (!await writeKit(db, userId, current, { ...usableKit(current.value, verified), submission }, {
    stage: "applied", applied_at: date, next_action: next, updated_at: today,
  })) {
    const raced = await getSourcingKit(db, userId, id);
    if (raced?.value.submission) return raced.value.submission;
    throw new Error("This kit changed. Review it and try again.");
  }
  return submission;
}

export async function confirmWithWorkspaceSettings(db: DbClient, userId: string, id: string, input: ConfirmSubmission, today: string) {
  const days = applyFollowUpDaysFromEnv(await envFor(db, userId));
  return confirmSourcingSubmission(db, userId, id, input, today, days);
}

export async function requestCompanyResearch(db: DbClient, userId: string, id: string) {
  const row = await oneOrNull(db.from("sourcing_companies").update({ research_requested: true }).eq("user_id", userId).eq("id", id)
    .select().maybeSingle(), "sourcing_companies", "request research");
  if (!row) throw new Error("Company not found.");
}

export async function saveCompanyResearch(db: DbClient, userId: string, id: string, baseVersion: number, input: ResearchFact[], today: string) {
  const company = await getSourcingCompany(db, userId, id);
  if (!company || !company.research_requested || company.research_version !== baseVersion) {
    throw new Error("No matching research request or the company record changed.");
  }
  const facts = z.array(ResearchFact).min(1).max(3).parse(input).map((fact) => {
    const url = sourceForCompany(fact.url, company.website);
    if (!url || fact.checkedAt > today) throw new Error("Use a checked official public company source, without profile links, queries or identifiers.");
    return { ...fact, url };
  });
  const saved = await oneOrNull(db.from("sourcing_companies").update({
    research: facts, research_version: baseVersion + 1, research_requested: false,
  }).eq("user_id", userId).eq("id", id).eq("research_version", baseVersion).eq("research_requested", true)
    .select().maybeSingle(), "sourcing_companies", "save research");
  if (!saved) throw new Error("The company record changed. Load it again.");
  return saved.research_version;
}

export async function saveRankReview(db: DbClient, userId: string, id: string, input: RankReview, confirmedByUser = false) {
  const review = RankReview.parse(input);
  const source = await loadDailySourcing(db, userId);
  if (!source.available.some((job) => job.id === id) || review.evidence.some((code) => !source.evidence.includes(code))) {
    throw new Error("Use an eligible watched role and verified evidence codes only.");
  }
  const row = await oneOrNull(db.from("sourced_jobs").select("sourcing_review").eq("user_id", userId).eq("id", id)
    .maybeSingle(), "sourced_jobs", "read ranking review");
  if (!row) throw new Error("No eligible role found.");
  if (JSON.stringify(RankReview.safeParse(row.sourcing_review).data) === JSON.stringify(review)) return review;
  if (row.sourcing_review != null && !confirmedByUser) throw new Error("Get explicit user confirmation before replacing a fit review.");
  const update = db.from("sourced_jobs").update({ sourcing_review: review }).eq("user_id", userId).eq("id", id);
  const saved = await oneOrNull((confirmedByUser ? update : update.is("sourcing_review", null)).select().maybeSingle(),
    "sourced_jobs", "save ranking review");
  if (!saved) throw new Error("The fit review changed. Reload it before writing.");
  return review;
}
