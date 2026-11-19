import { norm, type Bullet, type JdExtract, type Project } from "../types";

/**
 * The honest gap (DESIGN.md §2): JD skills/keywords with NO evidencing bullet.
 * The CV states only what the bullet bank evidences (buildDiff); the cover
 * letter is where these gaps get addressed. Same evidence test as buildDiff -
 * a normalized skill tag or a text mention - extended to variant texts, which
 * by the corpus rule are rewordings of the same fact and never a new claim.
 */

export type RequirementKind = "skill" | "keyword";

export interface Requirement {
  /** Normalized via norm(). */
  term: string;
  kind: RequirementKind;
}

export interface EvidencedRequirement extends Requirement {
  /** Bullets that back the term, in bank order. */
  bulletIds: string[];
}

export interface ApplicationGaps {
  /** Requirements nothing in the bank backs - the cover letter's input. */
  gaps: Requirement[];
  /** Requirements the bank does back, and by which bullets. */
  evidenced: EvidencedRequirement[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headingNames(heading: string | undefined, term: string): boolean {
  if (!heading) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}($|[^a-z0-9])`).test(heading);
}

function evidences(b: Bullet, term: string, heading?: string): boolean {
  if (b.skills.some((s) => norm(s) === term)) return true;
  if (headingNames(heading, term)) return true;
  if (norm(b.text).includes(term)) return true;
  return b.variants?.some((v) => norm(v.text).includes(term)) ?? false;
}

export function applicationGaps(jd: JdExtract, bank: Bullet[], projects: Project[] = []): ApplicationGaps {
  const headings = new Map(projects.map((p) => [p.id, norm(`${p.org} ${p.name} ${p.role ?? ""}`)]));
  const requirements: Requirement[] = [];
  const seen = new Set<string>();
  const add = (kind: RequirementKind) => (raw: string) => {
    const term = norm(raw);
    if (term.length === 0 || seen.has(term)) return;
    seen.add(term);
    requirements.push({ term, kind });
  };
  jd.skills.forEach(add("skill"));
  jd.keywords.forEach(add("keyword"));

  const gaps: Requirement[] = [];
  const evidenced: EvidencedRequirement[] = [];
  for (const r of requirements) {
    const bulletIds = bank.filter((b) => evidences(b, r.term, headings.get(b.projectId))).map((b) => b.id);
    if (bulletIds.length === 0) gaps.push(r);
    else evidenced.push({ ...r, bulletIds });
  }
  return { gaps, evidenced };
}
