/**
 * How an application card presents itself on the board: the role family as a tag, a
 * colour for that tag, and a company monogram for the badge. Pure and deterministic, so
 * the same company or family always gets the same colour.
 */

/** The tag colours the board can use (each maps to a system colour pair in ui.module.css). */
export const TONES = ["blue", "indigo", "purple", "teal", "orange", "pink"] as const;
export type Tone = (typeof TONES)[number];

/** Words a slug lower-cases that are written in capitals (or a fixed mixed case) in English. */
const ACRONYMS: Record<string, string> = {
  ai: "AI", ml: "ML", mba: "MBA", kpi: "KPI", kpis: "KPIs", okr: "OKR", okrs: "OKRs", cv: "CV", api: "API", apis: "APIs",
  sql: "SQL", b2b: "B2B", b2c: "B2C", saas: "SaaS", gtm: "GTM", pm: "PM", ux: "UX", ui: "UI", crm: "CRM", aws: "AWS",
  gcp: "GCP", llm: "LLM", llms: "LLMs", nlp: "NLP", roi: "ROI", esg: "ESG", hr: "HR", qa: "QA", seo: "SEO", vc: "VC",
  ipo: "IPO", "p&l": "P&L", ceo: "CEO", cfo: "CFO", coo: "COO", cto: "CTO", mvp: "MVP", erp: "ERP", iot: "IoT",
};

/** "product-management" -> "Product management", "metrics-kpi" -> "Metrics KPI", "mba" -> "MBA". */
export function familyLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => ACRONYMS[w.toLowerCase()] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const JOINERS = new Set(["&", "and", "the", "of"]);

/** "BCG (Boston ...)" -> "BCG", "Bain & Company" -> "BC", "Microsoft" -> "M". */
export function monogram(company: string): string {
  const words = company.trim().split(/\s+/).filter((w) => w && !JOINERS.has(w.toLowerCase()) && /^[\p{L}\p{N}]/u.test(w));
  if (!words.length) return "?";
  const first = words[0]!;
  if (/^[A-Z0-9]{2,4}$/.test(first)) return first;
  if (words.length === 1) return first.charAt(0).toUpperCase();
  return (first.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/** A stable tone for any key (FNV-1a hash). */
export function toneFor(key: string): Tone {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return TONES[h % TONES.length]!;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7 Sep", or "30 Dec 2025" outside the current year: how a date reads in a sentence. */
export function shortDate(iso: string, today: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const base = `${d} ${MONTHS[(m ?? 1) - 1]}`;
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`;
}
