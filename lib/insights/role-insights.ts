import { norm, type Application, type Bullet, type Project } from "../types";
import { tagDemand, type Taxonomy } from "../editorial/score";

/**
 * The role knowledge base. Every role read so far (applied to or not) carries a JD extract;
 * this adds them up for one line of work: what those roles ask for, how many of them ask,
 * and whether the bullet bank backs it. Three answers per requirement:
 *
 *   evidenced  a bullet backs it (its tag, or the words in its text or a variant)
 *   unstated   no bullet says it, but a role's narrative, outcomes or skills mention it:
 *              the experience is on record and the CV has no line for it - a wording gap
 *   gap        nothing on record backs it
 *
 * Wordings differ between postings, so requirements are grouped through the user's own
 * taxonomy first (the same phrase lists the CV scorer reads); what it does not cover stays
 * as its own line. Rules only: no model call. Pure - no I/O.
 */

export type RequirementStatus = "evidenced" | "unstated" | "gap";
export type RequirementSource = "tag" | "skill" | "keyword";

export interface RoleRequirement {
  /** A taxonomy tag, or the normalised skill/keyword when no tag covers it. */
  term: string;
  source: RequirementSource;
  /** How many of the roles ask for it. */
  roles: number;
  /** roles / all roles in the selection, 0..1. */
  share: number;
  /** The wordings seen in the postings, most common first. */
  phrases: string[];
  status: RequirementStatus;
  /** Bullets that back it, in bank order. */
  bulletIds: string[];
  /** For `unstated`: the roles in the history that mention it. */
  projectIds: string[];
}

export interface RoleInsights {
  /** Roles in the selection that have been read. */
  roles: number;
  requirements: RoleRequirement[];
}

/** One spelling per family: "Forward Deployed Engineering" and "forward-deployed-engineering" are the same. */
export function familyKey(family: string): string {
  return norm(family).replace(/[\s_]+/g, "-");
}

const read = (apps: Application[]) => apps.filter((a) => a.jdExtract);

/** Families seen, with how many read roles each has, most first. */
export function roleFamilies(apps: Application[]): { family: string; roles: number }[] {
  const counts = new Map<string, number>();
  for (const a of read(apps)) {
    const key = familyKey(a.jdExtract!.roleFamily);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, roles]) => ({ family, roles }))
    .sort((x, y) => y.roles - x.roles || x.family.localeCompare(y.family));
}

export interface RoleSelector {
  family?: string;
  /** Words that must all appear in the role title, for when the family label is not enough. */
  title?: string;
}

/** The read roles of one line of work: by family, by title words, or both. */
export function selectRoles(apps: Application[], by: RoleSelector): Application[] {
  const family = by.family ? familyKey(by.family) : null;
  const words = by.title ? norm(by.title).split(" ").filter(Boolean) : [];
  return read(apps).filter((a) => {
    if (family && familyKey(a.jdExtract!.roleFamily) !== family) return false;
    const title = norm(`${a.role} ${a.jdExtract!.role}`);
    return words.every((w) => title.includes(w));
  });
}

function bulletBacks(b: Bullet, term: string, source: RequirementSource): boolean {
  if (b.skills.some((s) => norm(s) === term)) return true;
  if (source === "tag") return false; // a tag is a label, not words to look for in the text
  if (norm(b.text).includes(term)) return true;
  return b.variants?.some((v) => norm(v.text).includes(term)) ?? false;
}

function historyMentions(p: Project, term: string, source: RequirementSource, phrases: string[]): boolean {
  if (p.skills.some((s) => norm(s) === term)) return true;
  const text = norm([p.narrative, ...p.outcomes].join(" "));
  const words = source === "tag" ? phrases : [term];
  return words.some((w) => w.length > 0 && text.includes(norm(w)));
}

export function roleInsights(roles: Application[], projects: Project[], taxonomy: Taxonomy): RoleInsights {
  const selected = read(roles);
  interface Tally { source: RequirementSource; roles: Set<string>; phrases: Map<string, number> }
  const tally = new Map<string, Tally>();
  const note = (roleId: string, term: string, source: RequirementSource, phrase: string) => {
    let t = tally.get(term);
    if (!t) tally.set(term, (t = { source, roles: new Set(), phrases: new Map() }));
    if (source === "tag") t.source = "tag";
    t.roles.add(roleId);
    t.phrases.set(phrase, (t.phrases.get(phrase) ?? 0) + 1);
  };

  for (const a of selected) {
    const jd = a.jdExtract!;
    for (const [tag, d] of Object.entries(jd.signals?.demand ?? {})) {
      if (!(tag in taxonomy.tags)) continue; // demand the extract's own skills added is counted below
      for (const phrase of d.phrases) note(a.id, tag, "tag", norm(phrase));
    }
    const fold = (source: "skill" | "keyword") => (raw: string) => {
      const term = norm(raw);
      if (!term) return;
      const tags = taxonomy.tags[term] ? [term] : Object.keys(tagDemand(term, taxonomy));
      if (tags.length) for (const tag of tags) note(a.id, tag, "tag", term);
      else note(a.id, term, source, term);
    };
    jd.skills.forEach(fold("skill"));
    jd.keywords.forEach(fold("keyword"));
  }

  const bullets = projects.flatMap((p) => p.bullets);
  const requirements = [...tally.entries()].map(([term, t]): RoleRequirement => {
    const phrases = [...t.phrases.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([p]) => p);
    const bulletIds = bullets.filter((b) => bulletBacks(b, term, t.source)).map((b) => b.id);
    const taxonomyPhrases = t.source === "tag" ? (taxonomy.tags[term] ?? []) : [];
    const projectIds = bulletIds.length
      ? []
      : projects.filter((p) => historyMentions(p, term, t.source, taxonomyPhrases)).map((p) => p.id);
    return {
      term,
      source: t.source,
      roles: t.roles.size,
      share: selected.length ? t.roles.size / selected.length : 0,
      phrases,
      status: bulletIds.length ? "evidenced" : projectIds.length ? "unstated" : "gap",
      bulletIds,
      projectIds,
    };
  });
  requirements.sort((x, y) => y.roles - x.roles || x.term.localeCompare(y.term));
  return { roles: selected.length, requirements };
}

/** What the roles ask for that no bullet backs, most demanded first: the input to a gap plan. */
export function topGaps(insights: RoleInsights, max: number): RoleRequirement[] {
  return insights.requirements.filter((r) => r.status !== "evidenced").slice(0, max);
}
