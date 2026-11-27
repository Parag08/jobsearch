"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { getSafeEvidence, putSafeEvidence, putSourcingRecipe, sourcingTerms } from "@/lib/repos/sourcing";
import { saveSettingsSection } from "@/lib/services/settings";
import { settingNumber, settingsHref, type SettingsSection } from "@/lib/settings/sections";
import { SETTINGS } from "@/lib/settings/registry";
import { parseDailyTarget } from "@/lib/watchlist/daily";
import { Evidence } from "@/lib/watchlist/safe-kit";

export interface SettingsState {
  errors?: Record<string, string>;
  failed?: boolean;
}

export async function saveSettingsAction(section: SettingsSection, form: FormData): Promise<SettingsState> {
  const w = await getWorkspace();
  if (!w) redirect(`/signin?next=${encodeURIComponent(settingsHref(section))}`);
  const { db, userId } = w;
  try {
    if (section === "job-search") {
      const target = parseDailyTarget(String(form.get("target") ?? "").trim());
      const cities = sourcingTerms(String(form.get("cities") ?? ""));
      const titles = sourcingTerms(String(form.get("titles") ?? ""));
      const excluded = sourcingTerms(String(form.get("excluded") ?? ""));
      const errors: Record<string, string> = {};
      if (!target) errors.target = "Enter a whole number from 1 to 2,147,483,647.";
      if (!cities) errors.cities = "Use up to 30 short city phrases without personal details.";
      if (!titles) errors.titles = "Use up to 30 short role phrases without personal details.";
      if (!excluded) errors.excluded = "Use up to 30 short title phrases without personal details.";
      if (!target || !cities || !titles || !excluded) return { errors };
      await putSourcingRecipe(db, userId, { target, cities, titles, excluded });
    } else if (section === "goals" || section === "interview" || section === "cv" || section === "advanced") {
      const codes = section === "cv" && form.has("changed-evidence")
        ? Evidence.array().max(Evidence.options.length).safeParse(form.getAll("evidence")) : null;
      if (codes && (!codes.success || (codes.data.length > 0 && form.get("attested") !== "on"))) {
        return { errors: { attested: "Confirm that each selected claim is true before saving." } };
      }
      const raw: Record<string, string> = {};
      for (const field of SETTINGS) {
        const value = form.get(field.key);
        if (typeof value === "string") raw[field.key] = field.kind.type === "int" || field.kind.type === "decimal"
          ? settingNumber(field.key, value.trim()) : value;
      }
      const result = await saveSettingsSection(db, userId, section, raw);
      if (!result.saved) return { errors: result.errors };
      if (codes?.success) {
        const current = await getSafeEvidence(db, userId);
        if (current.length !== codes.data.length || !current.every((code) => codes.data.includes(code))) {
          await putSafeEvidence(db, userId, codes.data);
          await w.persistDemoKits?.();
        }
      }
    } else {
      return { failed: true };
    }
  } catch {
    return { failed: true };
  }
  revalidatePath("/app", "layout");
  return {};
}
