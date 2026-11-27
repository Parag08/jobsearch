import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { getUserSettings } from "@/lib/repos/user-settings";
import { loadCatalog } from "@/lib/services/settings";
import { SETTINGS, SETTING_GROUPS, allowedModels } from "@/lib/settings/registry";
import { interviewCost, modelChoices } from "@/lib/settings/models";
import preferences from "@/data/settings/model-preferences.json";
import { SettingsForm, type FieldView, type ModelOption } from "./settings-form";
import ui from "../ui.module.css";

/**
 * Settings: every value the app used to take only from the deployment's env, now yours to change
 * (lib/settings/registry.ts). Blank = the deployment's value. The model pickers show the AI
 * Gateway's catalogue with prices, and which models this team's plan may use.
 */
export const dynamic = "force-dynamic";

const PREFS = preferences as unknown as Record<string, string[]>;

export default async function SettingsPage() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const [saved, catalog] = await Promise.all([
    getUserSettings(w.db, w.userId).catch(() => ({}) as Record<string, string>),
    loadCatalog(w.cannedAi ? undefined : process.env.AI_GATEWAY_API_KEY),
  ]);

  const option = (m: (typeof catalog.models)[number], recommended: string | null): ModelOption => ({
    id: m.id,
    name: m.name,
    price: `$${m.inputPerM} / $${m.outputPerM} per M tokens`,
    interview: interviewCost(m),
    eligible: m.eligible,
    reasoning: m.reasoning,
    recommended: m.id === recommended,
  });

  const allowed = allowedModels(process.env);
  const offered = catalog.models.filter((m) => allowed.has(m.id));

  const fields: FieldView[] = SETTINGS.map((s) => {
    const base: FieldView = {
      key: s.key,
      group: s.group,
      label: s.label,
      help: s.help,
      unit: s.unit,
      kind: s.kind,
      // A saved model no longer allowed is ignored on read; show it as blank so saving clears it.
      saved: s.kind.type === "model" && saved[s.key] && !allowed.has(saved[s.key]) ? "" : saved[s.key] ?? "",
      fallback: process.env[s.key] ?? "",
      blank: s.blank,
    };
    if (s.kind.type !== "model") return base;
    const choices = modelChoices(offered, PREFS[s.key] ?? []);
    return {
      ...base,
      ranked: choices.ranked.map((m) => option(m, choices.recommended)),
      others: choices.others.map((m) => option(m, choices.recommended)),
      recommended: choices.recommended,
    };
  });

  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <h1>Settings</h1>
        </div>
      </div>
      <section className={ui.panel}>
        <h2>Sourcing</h2>
        <Link href="/app/settings/sourcing" className={ui.btn}>Sourcing preferences</Link>
      </section>
      <SettingsForm
        groups={[...SETTING_GROUPS]}
        fields={fields}
        eligibilityKnown={catalog.eligibilityKnown}
        catalogLoaded={catalog.models.length > 0}
        demo={w.cannedAi}
      />
    </>
  );
}
