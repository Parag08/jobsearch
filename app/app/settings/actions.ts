"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { saveSettings } from "@/lib/services/settings";

export interface SettingsState {
  saved: boolean;
  errors: Record<string, string>;
  /** What was submitted, so a rejected form keeps the user's typing. */
  values: Record<string, string>;
}

/** Save the whole Settings form: the app's own rules check it, and nothing is saved on an error. */
export async function saveSettingsAction(_prev: SettingsState | null, formData: FormData): Promise<SettingsState> {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  const r = await saveSettings(w.db, w.userId, raw);
  if (r.saved) revalidatePath("/app", "layout");
  return { ...r, values: raw };
}
