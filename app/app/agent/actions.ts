"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/agent/token";
import { insertApiToken, revokeApiToken } from "@/lib/repos/api-tokens";

export interface NewTokenState {
  /** Shown once, straight after creation; it is not stored and cannot be shown again. */
  token?: string;
  error?: string;
}

export async function createTokenAction(_prev: NewTokenState | null, formData: FormData): Promise<NewTokenState> {
  const w = await getWorkspace();
  if (!w) return { error: "Sign in first." };
  if (w.mode !== "live") return { error: "Tokens need a signed-in workspace; this is the demo." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "Agent";
  const token = generateToken();
  await insertApiToken(w.db, w.userId, name, hashToken(token));
  revalidatePath("/app/agent");
  return { token };
}

export async function revokeTokenAction(id: string): Promise<void> {
  const w = await getWorkspace();
  if (!w || w.mode !== "live") return;
  await revokeApiToken(w.db, w.userId, id, new Date().toISOString());
  revalidatePath("/app/agent");
}
