"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { withLedger } from "@/lib/adapters/llm-factory";
import { aiLlm, aiReady, aiWrite } from "@/lib/services/ai-write";
import { demoTaxonomy } from "@/lib/db/demo";
import { GATEWAY_PREMIUM_MODEL } from "@/lib/adapters/vercel-gateway";
import { retryAfterSeconds } from "@/lib/adapters/llm-http";
import { logTokens } from "@/lib/repos/token-ledger";
import { readUnreadRoles } from "@/lib/services/read-role";
import { draftRolePlan } from "@/lib/services/role-plan";
import { rolePlanMaxGapsFromEnv, roleReadBatchFromEnv } from "@/lib/insights/settings";
import type { RoleSelector } from "@/lib/insights/role-insights";

async function ws() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

const today = () => new Date().toISOString().slice(0, 10);

function selection(formData: FormData): RoleSelector {
  const family = String(formData.get("family") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  return { ...(family ? { family } : {}), ...(title ? { title } : {}) };
}

/** The insights URL for a selection, with extra query pairs (message, counts) and an optional hash. */
function back(by: RoleSelector, extra: Record<string, string> = {}, hash = ""): string {
  const q = new URLSearchParams({ ...(by.family ? { family: by.family } : {}), ...(by.title ? { title: by.title } : {}), ...extra });
  const s = q.toString();
  return `/app/insights${s ? `?${s}` : ""}${hash}`;
}

/** Read the saved roles that have a posting and no extract yet, one batch (ROLE_READ_BATCH). */
export async function readUnreadRolesAction(formData?: FormData): Promise<void> {
  const w = await ws();
  const { db, userId } = w;
  const by = formData ? selection(formData) : {};
  const batch = roleReadBatchFromEnv(process.env);
  if (batch === undefined) redirect(back(by, { error: "Set ROLE_READ_BATCH to read saved roles." }));
  const base = aiLlm(w, demoTaxonomy);
  if (!base) {
    redirect(back(by, { error: "No AI provider configured yet. Set AI_GATEWAY_API_KEY (Vercel AI Gateway, uses your included credit) or GEMINI_API_KEY / GROQ_API_KEY." }));
  }

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

  const result = await readUnreadRoles({ db, llm }, userId, batch);
  revalidatePath("/app/insights");
  redirect(back(by, { read: String(result.read), failed: String(result.failed) }));
}

/** Draft the gap plan for the current selection: one premium call, stored, shown under #plan. */
export async function draftRolePlanAction(formData: FormData): Promise<void> {
  const w = await ws();
  const { db, userId } = w;
  const by = selection(formData);
  const maxGaps = rolePlanMaxGapsFromEnv(process.env);
  if (maxGaps === undefined) redirect(back(by, { error: "Set ROLE_PLAN_MAX_GAPS to enable plan drafting." }, "#plan"));
  if (!aiReady(w)) redirect(back(by, { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." }, "#plan"));
  const model = process.env.AI_GATEWAY_PREMIUM_MODEL ?? GATEWAY_PREMIUM_MODEL;
  const write = (prompt: string) => aiWrite(w, "role-plan", { model, prompt, json: false, maxOutputTokens: 1200 });

  let message: string | null = null;
  try {
    const result = await draftRolePlan({ db, write, model, maxGaps }, userId, by, today());
    if ("needs" in result) message = "Nothing to plan yet: no gaps in the roles read for this selection.";
    else await logTokens(db, userId, { date: today(), module: "role-plan", model, tokensIn: 0, tokensOut: 0 }).catch(() => undefined);
  } catch (err) {
    const wait = retryAfterSeconds(err);
    message = wait !== null ? `The writer is busy - try again in ${wait}s.` : err instanceof Error ? err.message : "Drafting failed.";
  }
  if (message) redirect(back(by, { error: message }, "#plan"));
  revalidatePath("/app/insights");
  redirect(back(by, {}, "#plan"));
}
