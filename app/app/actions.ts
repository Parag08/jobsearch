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
import { createLlm, withLedger } from "@/lib/adapters/llm-factory";
import { logTokens } from "@/lib/repos/token-ledger";
import { processJd } from "@/lib/services/process-jd";

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

/**
 * Open an application from a pasted JD (DESIGN.md section 2). Runs the same
 * tested processJd the API route does: extract ONCE via the routed small-tier
 * provider, merge the sector node, open a `saved` application - and log the
 * call to the token ledger. Returns an error string rather than throwing, so
 * the board can say what went wrong instead of showing a crash.
 */
export async function createFromJd(_prev: string | null, formData: FormData): Promise<string | null> {
  const { db, userId } = await ws();
  const jd = String(formData.get("jd") ?? "").trim();
  if (jd.length < 40) return "Paste the full posting - that looks too short to parse.";

  const base = createLlm(process.env);
  if (!base) return "No AI provider configured yet. Set AI_GATEWAY_API_KEY (Vercel AI Gateway, uses your included credit) or GEMINI_API_KEY / GROQ_API_KEY.";

  const day = today();
  const llm = withLedger(base, async (e) => {
    await logTokens(db, userId, {
      date: day,
      module: e.module,
      model: e.model,
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
    }).catch(() => undefined);
  });

  let applicationId: string;
  try {
    const result = await processJd({ db, llm }, userId, jd, day);
    applicationId = result.application.id;
  } catch (err) {
    return err instanceof Error ? err.message : "Could not read that posting.";
  }

  revalidatePath("/app");
  redirect(`/app/applications/${applicationId}`);
}
