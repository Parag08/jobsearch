"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getWorkspace } from "@/lib/db";
import { addSourcingCompany, connectSourcingBoard, getSourcingCompany, putSourcingRecipe, setSourcingCompanyActive,
  putSafeEvidence, setCompanyWebsite, setSourcingDecision, sourcingTerms } from "@/lib/repos/sourcing";
import { loadDailySourcing } from "@/lib/services/daily-sourcing";
import { refreshWatchlist } from "@/lib/services/refresh-watchlist";
import { HttpBoardFetcher } from "@/lib/watchlist/fetcher";
import { parseDailyTarget, type Decision } from "@/lib/watchlist/daily";
import { AnswerRequest, ConfirmSubmission, Evidence } from "@/lib/watchlist/safe-kit";
import { approveKitDraft, confirmWithWorkspaceSettings, getSourcingKit, prepareSourcingBatch,
  requestCompanyResearch, requestKitDraft, setSafeKitEvidence } from "@/lib/services/sourcing-kits";

async function workspace() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

const today = () => new Date().toISOString().slice(0, 10);
const value = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function saveSourcingRecipe(_previous: { error?: string }, form: FormData) {
  const { db, userId } = await workspace();
  const target = parseDailyTarget(value(form, "target").trim());
  const cities = sourcingTerms(value(form, "cities"));
  const titles = sourcingTerms(value(form, "titles"));
  const excluded = sourcingTerms(value(form, "excluded"));
  if (!target) return { error: "Enter a positive whole number for your daily target." };
  if (!cities || !titles || !excluded) return { error: "Use short city or role phrases only, without personal details." };
  try {
    await putSourcingRecipe(db, userId, { target, cities, titles, excluded });
  } catch {
    return { error: "Preferences could not be saved. Try again." };
  }
  revalidatePath("/app/watchlist");
  redirect("/app/settings/sourcing?saved=1");
}

export async function addTargetCompany(_previous: { error?: string }, form: FormData) {
  const { db, userId } = await workspace();
  try {
    const result = await addSourcingCompany(db, userId, value(form, "name"), value(form, "website"), today());
    if (result.error) return { error: result.error };
  } catch {
    return { error: "The company could not be added. Check for an existing target and try again." };
  }
  revalidatePath("/app/watchlist");
  redirect("/app/companies?added=1");
}

export async function toggleTargetCompany(id: string, active: boolean) {
  const { db, userId } = await workspace();
  try {
    await setSourcingCompanyActive(db, userId, id, active);
  } catch {
    redirect("/app/companies?error=1");
  }
  revalidatePath("/app/watchlist");
  revalidatePath("/app/companies/" + id);
  redirect(active ? "/app/companies?restored=1" : "/app/companies?removed=" + encodeURIComponent(id));
}

export async function connectTargetBoard(id: string, _previous: { error?: string }, form: FormData) {
  const { db, userId } = await workspace();
  try {
    const company = await getSourcingCompany(db, userId, id);
    if (!company || !await connectSourcingBoard(db, userId, company, value(form, "board"), today())) {
      return { error: "Use a public Greenhouse, Lever, Ashby, or SmartRecruiters board URL." };
    }
  } catch {
    return { error: "The source could not be saved. Try again." };
  }
  revalidatePath("/app/watchlist");
  redirect("/app/companies/" + id + "?source=1");
}

export async function refreshDailyBoards() {
  const w = await workspace();
  if (w.cannedAi) redirect("/app/watchlist?notice=sample");
  try {
    await refreshWatchlist({ db: w.db, fetcher: new HttpBoardFetcher(fetch) }, w.userId, today());
  } catch {
    redirect("/app/watchlist?notice=error");
  }
  revalidatePath("/app/companies");
  redirect("/app/watchlist?notice=checked");
}

export async function triageRole(id: string, decision: Decision | "available", view: "ranked" | "later" | "dismissed") {
  const { db, userId } = await workspace();
  try {
    const source = await loadDailySourcing(db, userId);
    if (![...source.available, ...source.later, ...source.dismissed].some((job) => job.id === id)) return;
    await setSourcingDecision(db, userId, id, decision);
  } catch {
    redirect("/app/watchlist?notice=error");
  }
  revalidatePath("/app/watchlist");
  revalidatePath("/app/companies");
  if (view !== "ranked") redirect("/app/watchlist?view=" + view);
}

export async function prepareDailyBatch() {
  const { db, userId } = await workspace();
  let result: Awaited<ReturnType<typeof prepareSourcingBatch>>;
  try {
    result = await prepareSourcingBatch(db, userId, today());
  } catch {
    redirect("/app/watchlist?notice=prepare-error");
  }
  revalidatePath("/app");
  const { applicationIds: ids, failedRoleIds } = result;
  if (failedRoleIds.length) redirect("/app/watchlist?notice=prepare-error");
  if (ids.length === 1) redirect("/app/applications/" + ids[0]);
  redirect("/app/watchlist?notice=" + (ids.length ? "prepared" : "no-picks"));
}

export async function saveEvidence(_previous: { error?: string }, form: FormData) {
  const { db, userId } = await workspace();
  const codes = Evidence.array().max(Evidence.options.length).safeParse(form.getAll("evidence"));
  if (!codes.success || form.get("attested") !== "on") return { error: "Confirm that every selected claim is true of your work." };
  try {
    await putSafeEvidence(db, userId, codes.data);
  } catch {
    return { error: "Verified evidence could not be saved. Try again." };
  }
  revalidatePath("/app/watchlist");
  redirect("/app/settings/sourcing?saved=1");
}

const kitPath = (id: string) => "/app/applications/" + id;
type FormState = { error?: string };

export async function saveKitEvidence(id: string, revision: number, _state: FormState, form: FormData) {
  const { db, userId } = await workspace();
  const codes = Evidence.array().max(3).safeParse(form.getAll("evidence"));
  if (!codes.success) return { error: "Choose up to three verified claims." };
  try {
    await setSafeKitEvidence(db, userId, id, codes.data, form.get("reviewed") === "on", revision);
  } catch {
    return { error: "Could not save this review. Reload and choose only claims verified in Sourcing preferences." };
  }
  revalidatePath(kitPath(id));
  return {};
}

export async function requestDraft(id: string, section: "letter" | "answer", _state: FormState, form: FormData) {
  const { db, userId } = await workspace();
  const parsed = AnswerRequest.safeParse({ prompt: form.get("prompt"), unit: form.get("unit"), limit: Number(form.get("limit")) });
  if (section === "answer" && !parsed.success) return { error: "Choose a question and a limit from 1 to 10,000." };
  try {
    await requestKitDraft(db, userId, id, section, parsed.data);
  } catch {
    return { error: "Could not request a draft. Add verified CV evidence first and check that the kit is still Saved." };
  }
  revalidatePath(kitPath(id));
  return {};
}

export async function approveDraft(id: string, section: "letter" | "answer", revision: number) {
  const { db, userId } = await workspace();
  try {
    await approveKitDraft(db, userId, id, section, revision);
  } catch {
    redirect(kitPath(id) + "?kitError=review");
  }
  revalidatePath(kitPath(id));
}

export async function askForCompanyResearch(id: string) {
  const { db, userId } = await workspace();
  if (!await getSourcingCompany(db, userId, id)) notFound();
  const path = "/app/companies/" + id;
  try {
    await requestCompanyResearch(db, userId, id);
  } catch {
    redirect(path + "?view=research&error=1");
  }
  redirect(path + "?view=research");
}

export async function addCompanyWebsite(id: string, _state: FormState, form: FormData) {
  const { db, userId } = await workspace();
  try {
    if (!await setCompanyWebsite(db, userId, id, value(form, "website"))) {
      return { error: "Enter a public HTTPS website for this company." };
    }
  } catch {
    return { error: "The website could not be saved. Check if another target uses it." };
  }
  redirect("/app/companies/" + id + "?view=research");
}

export async function confirmManualSubmission(id: string, revision: number, _state: FormState, form: FormData) {
  const { db, userId } = await workspace();
  const parsed = ConfirmSubmission.safeParse({ date: form.get("date"), materials: form.get("materials"), revision,
    confirmedByUser: form.get("confirmed") === "on" });
  if (!parsed.success || parsed.data.date > today()) return { error: "Enter the actual date, choose the materials used, and confirm the employer accepted the submission." };
  const kit = await getSourcingKit(db, userId, id);
  if (!kit) notFound();
  try {
    await confirmWithWorkspaceSettings(db, userId, id, parsed.data, today());
  } catch {
    return { error: "Could not confirm. Reload the kit and review the exact safe content, or select different materials." };
  }
  revalidatePath("/app");
  revalidatePath("/app/watchlist");
  redirect(kitPath(id));
}
