import type { DbClient } from "../repos/db";
import { getUserSettings, getUserSettingsVersion, putUserSettings, putUserSettingsVersion } from "../repos/user-settings";
import { cleanValues, SETTINGS, settingsEnv, validateSettings } from "../settings/registry";
import { settingLocation, type SettingsSection } from "../settings/sections";
import { parseCatalog, type CatalogModel } from "../settings/models";

type Env = Record<string, string | undefined>;

/**
 * The env this user's code reads: the deployment's env with the user's saved settings on top
 * (lib/settings/registry.ts). Every place that reads a user-adjustable setting goes through this.
 */
export async function envFor(db: DbClient, userId: string, base: Env = process.env): Promise<Env> {
  const saved = await getUserSettings(db, userId).catch(() => ({}));
  return settingsEnv(base, saved);
}

/** Validate with the app's own rules, then replace the user's whole set. Nothing is saved on an error. */
export async function saveSettings(
  db: DbClient,
  userId: string,
  raw: Record<string, unknown>,
  base: Env = process.env,
): Promise<{ saved: boolean; errors: Record<string, string> }> {
  const errors = validateSettings(base, raw);
  if (Object.keys(errors).length) return { saved: false, errors };
  await putUserSettings(db, userId, cleanValues(raw));
  return { saved: true, errors: {} };
}

export async function saveSettingsSection(
  db: DbClient,
  userId: string,
  section: SettingsSection,
  raw: Record<string, unknown>,
  base: Env = process.env,
): Promise<{ saved: boolean; errors: Record<string, string> }> {
  const keys = SETTINGS.filter(({ key }) => settingLocation(key).section === section && typeof raw[key] === "string").map(({ key }) => key);
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getUserSettingsVersion(db, userId);
    const merged = { ...current.values };
    for (const key of keys) {
      const value = (raw[key] as string).trim();
      if (value) merged[key] = value;
      else delete merged[key];
    }
    const errors = validateSettings(base, merged, keys);
    if (Object.keys(errors).length) return { saved: false, errors };
    if (!keys.length || await putUserSettingsVersion(db, userId, current, merged)) return { saved: true, errors: {} };
  }
  throw new Error("Settings changed while saving.");
}

const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

/**
 * The catalogue with this plan's eligibility (the keyed `include_availability` call). That call is
 * rate limited per team, so on any failure the public list is used and eligibility is unknown.
 */
export async function loadCatalog(apiKey: string | undefined, doFetch: typeof fetch = fetch): Promise<{ models: CatalogModel[]; eligibilityKnown: boolean }> {
  if (apiKey) {
    try {
      const res = await doFetch(`${MODELS_URL}?include_availability`, { headers: { authorization: `Bearer ${apiKey}` }, cache: "no-store" });
      if (res.ok) {
        const models = parseCatalog(await res.json());
        if (models.length) return { models, eligibilityKnown: models.some((m) => m.eligible !== null) };
      }
    } catch {
      /* fall through to the public list */
    }
  }
  try {
    const res = await doFetch(MODELS_URL, { cache: "no-store" });
    const models = res.ok ? parseCatalog(await res.json()).map((m) => ({ ...m, eligible: null })) : [];
    return { models, eligibilityKnown: false };
  } catch {
    return { models: [], eligibilityKnown: false };
  }
}
