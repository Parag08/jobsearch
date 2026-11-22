/**
 * The AI Gateway's model catalogue, as the Settings page shows it: language models with their
 * price per million tokens and whether this team's plan may use them. The free tier "includes a
 * subset of models, not the full catalog"; the gateway says which when asked with the team's key
 * (`GET /v1/models?include_availability` -> `model_eligibility.status`). Pure: the fetch is in
 * lib/services/settings.ts.
 */

export interface CatalogModel {
  id: string;
  name: string;
  /** USD per million input tokens. */
  inputPerM: number;
  outputPerM: number;
  /** true = this plan may use it; false = needs paid credits; null = the gateway did not say. */
  eligible: boolean | null;
  /** A thinking model: an effort setting applies to it. */
  reasoning: boolean;
}

const perM = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1e6 * 1e4) / 1e4 : NaN;
};

export function parseCatalog(raw: unknown): CatalogModel[] {
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: CatalogModel[] = [];
  for (const m of data as Record<string, unknown>[]) {
    if (!m || typeof m.id !== "string" || m.type !== "language" || m.id.endsWith("-batch")) continue;
    const pricing = (m.pricing ?? {}) as Record<string, unknown>;
    const inputPerM = perM(pricing.input);
    const outputPerM = perM(pricing.output);
    if (!Number.isFinite(inputPerM) || !Number.isFinite(outputPerM)) continue;
    const status = (m.model_eligibility as { status?: unknown } | undefined)?.status;
    out.push({
      id: m.id,
      name: typeof m.name === "string" ? m.name : m.id,
      inputPerM,
      outputPerM,
      eligible: typeof status === "string" ? status === "eligible" : null,
      reasoning: Array.isArray(m.tags) && m.tags.includes("reasoning"),
    });
  }
  return out;
}

export interface ModelChoices {
  /** The job's preferred models, best first, as far as the catalogue has them. */
  ranked: CatalogModel[];
  /** Every other model this plan may use, cheapest first. */
  others: CatalogModel[];
  /** The first preferred model the plan allows (or the first preferred when nobody knows). */
  recommended: string | null;
}

export function modelChoices(catalog: CatalogModel[], preferences: readonly string[]): ModelChoices {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const ranked = preferences.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const rankedIds = new Set(ranked.map((m) => m.id));
  const others = catalog
    .filter((m) => !rankedIds.has(m.id) && m.eligible === true)
    .sort((a, b) => a.inputPerM + a.outputPerM - (b.inputPerM + b.outputPerM));
  const recommended = (ranked.find((m) => m.eligible === true) ?? (ranked.every((m) => m.eligible === null) ? ranked[0] : undefined))?.id ?? null;
  return { ranked, others, recommended };
}

/**
 * A rough price for one full mock interview, to show what a budget buys. The shape is an estimate,
 * stated on the page: about 20 interviewer turns, each ~2,000 tokens in and ~600 out (a thinking
 * model at low effort included).
 */
export const INTERVIEW_ESTIMATE = { turns: 20, inTokens: 2000, outTokens: 600 } as const;

export function interviewCost(m: Pick<CatalogModel, "inputPerM" | "outputPerM">): number {
  const e = INTERVIEW_ESTIMATE;
  return (e.turns * (e.inTokens * m.inputPerM + e.outTokens * m.outputPerM)) / 1e6;
}
