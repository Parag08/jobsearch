import { companySlug } from "./company-questions";

/**
 * The Interview tab's "Preparing for" strip (docs/FULL-INTERVIEW.md section 3): Practice is
 * always there; then one entry per company you're applying to. The company decides the kind
 * of interview: a round an agent pushed ("round"), a consulting firm ("consulting": case and
 * fit), or one built from the job ad ("job"). Pure; the page passes its data in.
 */

export type PrepKind = "round" | "consulting" | "job";

export interface PrepEntry {
  slug: string;
  name: string;
  role: string;
  kind: PrepKind;
  /** The pushed round's name, e.g. "Technical interview, 24 Nov". */
  round: string | null;
}

export const GENERAL = "general";

/** By the firms the question bank names (data), or a role family that says consulting. */
export function isConsultingFirm(company: string, roleFamily: string | null, firmLabels: Record<string, string>): boolean {
  if (roleFamily && /consult/i.test(roleFamily)) return true;
  const words = new Set(company.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return Object.entries(firmLabels).some(([id, label]) => words.has(id.toLowerCase()) || words.has(label.toLowerCase()));
}

export function prepEntries(
  questions: { id: string; company?: string; round?: string | null }[],
  apps: { company: string; role: string; roleFamily: string | null }[],
  firmLabels: Record<string, string>,
): PrepEntry[] {
  const out: PrepEntry[] = [];
  for (const q of questions) {
    if (!q.company) continue;
    const slug = companySlug(q.company);
    const app = apps.find((a) => companySlug(a.company) === slug);
    let e = out.find((x) => x.slug === slug);
    if (!e) {
      e = { slug, name: q.company, role: app?.role ?? "", kind: isConsultingFirm(q.company, app?.roleFamily ?? null, firmLabels) ? "consulting" : "job", round: null };
      out.push(e);
    }
    if (q.id.startsWith("role:")) {
      e.kind = "round";
      e.round ??= q.round ?? null;
    }
  }
  return [...out.filter((e) => e.kind === "round"), ...out.filter((e) => e.kind !== "round")];
}

/** Which page opens: an explicit choice, else what a linked question belongs to, else the next real round, else Practice. */
export function choosePrep(
  params: { prep?: string | null; company?: string | null; q?: string | null; tab?: string | null },
  entries: PrepEntry[],
  ownerOf: (questionId: string) => string | null,
): string {
  const known = (slug: string | null | undefined) => (slug === GENERAL || entries.some((e) => e.slug === slug) ? slug! : null);
  const explicit = known(params.prep) ?? known(params.company);
  if (explicit) return explicit;
  if (params.q) return known(ownerOf(params.q) ? companySlug(ownerOf(params.q)!) : null) ?? GENERAL;
  if (params.tab && params.tab !== "behavioural") return GENERAL;
  return entries.find((e) => e.kind === "round")?.slug ?? GENERAL;
}
