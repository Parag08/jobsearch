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
import { listCompanies, watchableCompanies } from "@/lib/repos/companies";
import { draftStory, saveStory } from "@/lib/repos/stories";
import { streamGatewayText } from "@/lib/adapters/vercel-gateway-stream";
import { GATEWAY_SMALL_MODEL } from "@/lib/adapters/vercel-gateway";
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

/**
 * Watch a company from the central directory (DESIGN.md section 4).
 *
 * Carries the directory's VERIFIED ats and token across rather than re-deriving
 * them from the careers URL: probing checked them against the live board, and most
 * verified boards sit behind a vanity domain that detectAts would call "unknown"
 * (grab.careers is a SmartRecruiters board; nothing in the URL says so).
 */
export async function watchCompany(companyId: string): Promise<void> {
  const { db, userId } = await ws();
  const directory = await listCompanies(db);
  const c = directory.find((x) => x.id === companyId);
  if (!c) return;

  await addWatchlistEntry(db, userId, {
    company: c.name,
    careersUrl: c.careersUrl,
    ats: c.ats,
    token: c.token,
    active: true,
    addedAt: today(),
  });
  revalidatePath("/app/watchlist");
}

/** Watch every directory company whose board can actually be read today. */
export async function watchAllReadable(): Promise<void> {
  const { db, userId } = await ws();
  const readable = await watchableCompanies(db);
  for (const c of readable) {
    await addWatchlistEntry(db, userId, {
      company: c.name,
      careersUrl: c.careersUrl,
      ats: c.ats,
      token: c.token,
      active: true,
      addedAt: today(),
    });
  }
  revalidatePath("/app/watchlist");
}

/** Capture a STAR story the user wrote (DESIGN.md section 3: captured, never generated). */
export async function saveStoryAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const { db, userId } = await ws();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return "Pick which role this story comes from.";

  const result = String(formData.get("result") ?? "").trim();
  if (!result) return "A story needs a Result - what changed because of it?";

  try {
    await saveStory(
      db,
      userId,
      draftStory({
        projectId,
        bulletId: String(formData.get("bulletId") ?? "") || null,
        situation: String(formData.get("situation") ?? "").trim(),
        task: String(formData.get("task") ?? "").trim(),
        action: String(formData.get("action") ?? "").trim(),
        result,
        capturedAt: today(),
      }),
    );
  } catch (err) {
    return err instanceof Error ? err.message : "Could not save that story.";
  }
  revalidatePath("/app/interview");
  return null;
}

/**
 * AI assist for a story draft - and note what it deliberately does NOT do.
 *
 * It returns the follow-up questions a real interviewer would ask about what the
 * user wrote. It does not write, extend or embellish the story: a fabricated
 * interview answer collapses on the first probe, which is exactly the moment it
 * matters (DESIGN.md section 3). Probing a draft adds no claim; writing one does.
 */
export interface ProbeState {
  questions?: string[];
  error?: string;
}

export async function probeStoryAction(_prev: ProbeState | null, formData: FormData): Promise<ProbeState> {
  const { db, userId } = await ws();

  const parts = ["situation", "task", "action", "result"].map((k) => String(formData.get(k) ?? "").trim());
  if (parts.join(" ").trim().length < 40) {
    return { error: "Write a rough draft first - the questions come from what you wrote." };
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  const [situation, task, action, result] = parts;
  const prompt = [
    "You are a consulting interviewer reading a candidate's draft STAR answer.",
    "Ask the 4 sharpest follow-up questions you would actually ask to test whether this is real and whether they personally did it.",
    "Probe for: what THEY did versus the team, what resisted them, what the number really measures, and what they would do differently.",
    "Do NOT rewrite or extend their story. Do NOT invent detail. Output only the questions, one per line, no numbering.",
    "",
    `Situation: ${situation}`,
    `Task: ${task}`,
    `Action: ${action}`,
    `Result: ${result}`,
  ].join("\n");

  let text = "";
  try {
    for await (const delta of streamGatewayText({
      apiKey,
      model: process.env.AI_GATEWAY_SMALL_MODEL ?? GATEWAY_SMALL_MODEL,
      prompt,
      maxOutputTokens: 300,
    })) {
      text += delta;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach the model." };
  }

  // Usage is not itemised by the streaming endpoint here, so the ledger records the
  // call without token counts rather than inventing them.
  await logTokens(db, userId, {
    date: today(),
    module: "interview-probe",
    model: process.env.AI_GATEWAY_SMALL_MODEL ?? GATEWAY_SMALL_MODEL,
    tokensIn: 0,
    tokensOut: 0,
  }).catch(() => undefined);

  const questions = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 8)
    .slice(0, 5);

  return questions.length ? { questions } : { error: "The model returned nothing usable. Try again." };
}
