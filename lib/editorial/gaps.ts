import { norm, type Bullet, type JdExtract } from "../types";

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

function evidences(b: Bullet, term: string): boolean {
  if (b.skills.some((s) => norm(s) === term)) return true;
  if (norm(b.text).includes(term)) return true;
  return b.variants?.some((v) => norm(v.text).includes(term)) ?? false;
}

export function applicationGaps(jd: JdExtract, bank: Bullet[]): ApplicationGaps {
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
    const bulletIds = bank.filter((b) => evidences(b, r.term)).map((b) => b.id);
    if (bulletIds.length === 0) gaps.push(r);
    else evidenced.push({ ...r, bulletIds });
  }
  return { gaps, evidenced };
}
