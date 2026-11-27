"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace } from "@/lib/db";
import { generateToken, hashToken, tokenOptions } from "@/lib/agent/token";
import { insertApiToken, revokeApiToken } from "@/lib/repos/api-tokens";
import { SETTINGS_PATH } from "@/lib/settings/sections";

export interface NewTokenState {
  /** Shown once, straight after creation; it is not stored and cannot be shown again. */
  token?: string;
  error?: string;
}

export async function createTokenAction(formData: FormData): Promise<NewTokenState> {
  const w = await getWorkspace();
  if (!w) return { error: "Sign in first." };
  if (w.mode !== "live") return { error: "Tokens need a signed-in workspace; this is the demo." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 60) return { error: "Enter a name from 1 to 60 characters." };
  const { scope, days } = tokenOptions(formData.get("scope"), formData.get("days"));
  const token = generateToken();
  try {
    await insertApiToken(w.db, w.userId, name, hashToken(token), { scope, days });
  } catch {
    return { error: "Couldn’t create a key. Your choices are still here—try again." };
  }
  revalidatePath(SETTINGS_PATH);
  return { token };
}

export async function revokeTokenAction(id: string): Promise<boolean> {
  const w = await getWorkspace();
  if (!w || w.mode !== "live") return false;
  try {
    await revokeApiToken(w.db, w.userId, id, new Date().toISOString());
  } catch {
    return false;
  }
  revalidatePath(SETTINGS_PATH);
  return true;
}
