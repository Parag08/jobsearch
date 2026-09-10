"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { advance } from "@/lib/pipeline";
import { STAGES, type ClosedReason, type Stage } from "@/lib/types";
import { getApplication, updateApplication } from "@/lib/repos/applications";
import { markApplied } from "@/lib/services/mark-applied";
import { tailorCv } from "@/lib/services/tailor-cv";
import { refreshWatchlist } from "@/lib/services/refresh-watchlist";
import { addWatchlistEntry, removeWatchlistEntry, setWatchlistActive } from "@/lib/repos/watchlist";
import { newWatchlistEntry } from "@/lib/watchlist/types";
import { HttpBoardFetcher } from "@/lib/watchlist/fetcher";
import { setSourcedJobStatus } from "@/lib/repos/sourced-jobs";

async function ws() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Move an application; the applied transition goes through markApplied so the sent CV freezes. */
export async function moveStage(applicationId: string, to: Stage, closedReason?: ClosedReason): Promise<void> {
  const { db, userId } = await ws();
  if (!STAGES.includes(to)) return;
  if (to === "applied") {
    await markApplied({ db }, userId, applicationId, new Date().toISOString());
  } else {
    const app = await getApplication(db, userId, applicationId);
    if (!app) return;
    await updateApplication(db, userId, advance(app, to, today(), closedReason));
  }
  revalidatePath("/app");
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function setNextAction(applicationId: string, formData: FormData): Promise<void> {
  const { db, userId } = await ws();
  const app = await getApplication(db, userId, applicationId);
  if (!app) return;
  const nextAction = String(formData.get("nextAction") ?? "").trim();
  await updateApplication(db, userId, { ...app, nextAction: nextAction || null, updatedAt: today() });
  revalidatePath("/app");
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function tailorCvAction(applicationId: string): Promise<void> {
  const { db, userId } = await ws();
  await tailorCv({ db }, userId, applicationId, today());
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function addWatchlist(formData: FormData): Promise<void> {
  const { db, userId } = await ws();
  const company = String(formData.get("company") ?? "").trim();
  const careersUrl = String(formData.get("careersUrl") ?? "").trim();
  if (!company || !careersUrl) return;
  await addWatchlistEntry(db, userId, newWatchlistEntry(company, careersUrl, today()));
  revalidatePath("/app/watchlist");
}

export async function toggleWatchlist(id: string, active: boolean): Promise<void> {
  const { db, userId } = await ws();
  await setWatchlistActive(db, userId, id, active);
  revalidatePath("/app/watchlist");
}

export async function removeWatchlist(id: string): Promise<void> {
  const { db, userId } = await ws();
  await removeWatchlistEntry(db, userId, id);
  revalidatePath("/app/watchlist");
}

export async function refreshWatchlistAction(): Promise<void> {
  const { db, userId } = await ws();
  await refreshWatchlist({ db, fetcher: new HttpBoardFetcher(fetch) }, userId, today());
  revalidatePath("/app/watchlist");
}

export async function setJobStatus(id: string, status: "shortlisted" | "dismissed" | "tracked"): Promise<void> {
  const { db, userId } = await ws();
  await setSourcedJobStatus(db, userId, id, status);
  revalidatePath("/app/watchlist");
}
