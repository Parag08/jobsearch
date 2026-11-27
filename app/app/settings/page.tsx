import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { getUserSettings } from "@/lib/repos/user-settings";
import { getSafeEvidence, getSourcingRecipe } from "@/lib/repos/sourcing";
import { loadCatalog } from "@/lib/services/settings";
import { SETTINGS, allowedModels } from "@/lib/settings/registry";
import { interviewCost, modelChoices } from "@/lib/settings/models";
import { displayNumber, settingLocation, settingsHref, settingsSection, SOURCING_FIELDS } from "@/lib/settings/sections";
import preferences from "@/data/settings/model-preferences.json";
import { AssistantSection } from "./assistant-section";
import { SettingsForm, type FieldView, type ModelOption } from "./settings-form";
import { SettingsFrame } from "./settings-frame";

const { _note, ...modelPreferences } = preferences;
const PREFS: Record<string, string[]> = modelPreferences;
const searchable = [
  ...SOURCING_FIELDS, ...SETTINGS,
  { key: "evidence", label: "Verified experience and matching evidence" },
  { key: "assistant-access", label: "Connect or revoke assistant access" },
].map(({ key, label }) => ({ key, label, ...settingLocation(key) }));

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const section = settingsSection((await searchParams).section);
  const w = await getWorkspace();
  if (!w) redirect(`/signin?next=${encodeURIComponent(settingsHref(section))}`);
  let content: React.ReactNode;
  try {
    if (section === "assistant") {
      content = await AssistantSection(w);
    } else if (section === "job-search") {
      const recipe = await getSourcingRecipe(w.db, w.userId);
      const sourcing = { target: String(recipe.target), cities: recipe.cities.join(", "), titles: recipe.titles.join(", "), excluded: recipe.excluded.join(", ") };
      content = <SettingsForm key={section} section={section} sourcing={sourcing} fields={[]} />;
    } else {
      const [saved, evidence, catalog] = await Promise.all([
        getUserSettings(w.db, w.userId),
        section === "cv" ? getSafeEvidence(w.db, w.userId) : [],
        section === "advanced" ? loadCatalog(w.mode === "live" ? process.env.AI_GATEWAY_API_KEY : undefined) : null,
      ]);
      const deployment = process.env;
      const allowed = allowedModels(deployment);
      const offered = (catalog?.models ?? []).filter((m) => allowed.has(m.id));
      const option = (m: (typeof offered)[number], recommended: string | null): ModelOption => ({
        id: m.id, name: m.name, price: `$${m.inputPerM} / $${m.outputPerM} per M tokens`,
        interview: interviewCost(m), eligible: m.eligible, reasoning: m.reasoning, recommended: m.id === recommended,
      });
      const fields: FieldView[] = SETTINGS.filter(({ key }) => settingLocation(key).section === section).map((field) => {
        const { key, kind } = field;
        const numeric = kind.type === "int" || kind.type === "decimal";
        const savedValue = saved[key]?.trim() ?? "";
        const fallback = deployment[key]?.trim() ?? "";
        const base = {
          ...field, group: settingLocation(key).group,
          saved: numeric ? displayNumber(key, savedValue) : savedValue,
          fallback: numeric ? displayNumber(key, fallback) : fallback,
          unit: key.endsWith("_MS") ? "seconds" : ["CV_MAX_ORG_SHARE", "CV_COLLISION_OVERLAP", "INTERVIEW_TURN_QUIET_LEVEL"].includes(key) ? "%" : field.unit,
          help: key === "CV_MAX_ORG_SHARE" ? "Maximum share of bullet lines for one employer." :
            key === "INTERVIEW_TURN_QUIET_LEVEL" ? "Raise this threshold in a noisy room." : field.help,
        };
        if (kind.type !== "model") return base;
        const choices = modelChoices(offered, PREFS[key] ?? []);
        return {
          ...base,
          ranked: choices.ranked.map((m) => option(m, choices.recommended)),
          others: choices.others.map((m) => option(m, choices.recommended)),
          recommended: choices.recommended,
        };
      });
      content = <SettingsForm key={section} section={section} fields={fields} evidence={evidence}
        catalogLoaded={!!catalog?.models.length} eligibilityKnown={catalog?.eligibilityKnown} demo={w.cannedAi} />;
    }
  } catch {
    content = null;
  }

  return <SettingsFrame key={section} section={section} searchable={searchable} loadFailed={content === null}>{content}</SettingsFrame>;
}
