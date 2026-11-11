import type { Bullet, Project } from "../types";

/**
 * Bullet scoring, ported from the findparagjob CV builder (tools/cv-builder/lib/score.js).
 * Deliberately transparent - no embeddings, no model call - so every number can be traced
 * to a literal phrase in the JD. Two relevance signals:
 *
 *   1. TAG DEMAND  the user's taxonomy maps each tag to the phrases a JD uses for it;
 *                  a bullet carrying a demanded tag inherits that demand. This is what lets
 *                  "stakeholder alignment" surface a bullet tagged cross-functional.
 *   2. ECHO        distinctive words shared by the bullet and the JD - the vocabulary the
 *                  taxonomy has not been taught yet.
 *
 * Then the owner's strength and the role's recency nudge the order. Pure - no I/O.
 */

/** The user's controlled vocabulary (profile data, never a code constant - rule 4). */
export interface Taxonomy {
  tags: Record<string, string[]>;
  seniorityHints?: Record<string, string[]>;
}

export interface TagDemand {
  /** 1 per distinct phrase found, +0.25 per repeat (max 3 counted), capped at 5. */
  demand: number;
  /** The phrases that fired, most frequent first. */
  phrases: string[];
}

/** What the scorer needs from a JD, computed once at intake and stored on the extract. */
export interface JdSignals {
  demand: Record<string, TagDemand>;
  /** The JD's distinctive words, sorted. */
  tokens: string[];
}

const STOPWORDS = new Set(
  `a about above after all also am an and any are as at be because been before being below between
both but by can could did do does doing down during each few for from further had has have having he
her here hers him his how i if in into is it its itself just me more most my no nor not of off on once
only or other our ours out over own same she should so some such than that the their theirs them then
there these they this those through to too under until up very was we were what when where which while
who whom why will with would you your yours role team teams work working works year years new using used
use across within able strong excellent good great ability experience experienced skills skill including
include includes etc candidate candidates applicant you'll we're company job position opportunity
looking join plus preferred required requirement requirements responsibilities qualifications`
    .split(/\s+/)
    .filter(Boolean),
);

/** Lowercase, punctuation to spaces, collapsed whitespace (score.js normalise). */
export function normalise(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9+#/&'.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function countOccurrences(haystack: string, needle: string): number {
  const n = normalise(needle);
  if (!n) return 0;
  // Single tokens match on word boundaries so "ai" does not fire inside "said", and
  // take a plural ("customer" -> "customers") - the one change from score.js, which
  // missed every plural the JD used.
  const pattern = /^[a-z0-9+#]+$/.test(n)
    ? new RegExp(`(?<![a-z0-9])${escapeRe(n)}(?:e?s)?(?![a-z0-9])`, "g")
    : new RegExp(escapeRe(n), "g");
  return (haystack.match(pattern) ?? []).length;
}

/** How badly does this JD want each tag? Tags with no hit are absent. */
export function tagDemand(jdText: string, taxonomy: Taxonomy): Record<string, TagDemand> {
  const jd = normalise(jdText);
  const out: Record<string, TagDemand> = {};
  for (const [tag, phrases] of Object.entries(taxonomy.tags)) {
    const hits: { phrase: string; count: number }[] = [];
    let repeats = 0;
    for (const phrase of phrases) {
      const count = countOccurrences(jd, phrase);
      if (count > 0) {
        hits.push({ phrase, count });
        repeats += Math.min(count, 3) - 1;
      }
    }
    if (hits.length === 0) continue;
    // Distinct phrases matter far more than the same phrase repeated.
    out[tag] = {
      demand: Math.min(5, hits.length + repeats * 0.25),
      phrases: hits.sort((a, b) => b.count - a.count).map((h) => h.phrase),
    };
  }
  return out;
}

export function distinctiveTokens(text: string): Set<string> {
  return new Set(
    normalise(text)
      .split(" ")
      // edge punctuation off, so "roadmap." matches "roadmap" (score.js missed sentence ends)
      .map((w) => w.replace(/^[.'&/-]+|[.'&/-]+$/g, ""))
      .filter((w) => w.length >= 5 && !STOPWORDS.has(w) && !/^\d+$/.test(w)),
  );
}

/**
 * The extract's skills and keywords as demand for bullet tags of the same (normalised) name -
 * bullets made in the app tag themselves with plain skills, not taxonomy ids. Demand the
 * taxonomy already found is never lowered.
 */
export function withExtractDemand(signals: JdSignals, extract: { skills: string[]; keywords: string[] }): JdSignals {
  const demand = { ...signals.demand };
  for (const term of [...extract.skills, ...extract.keywords]) {
    const key = normalise(term);
    if (key && !demand[key]) demand[key] = { demand: 1, phrases: [term] };
  }
  return { ...signals, demand };
}

export function jdSignals(jdText: string, taxonomy: Taxonomy): JdSignals {
  return { demand: tagDemand(jdText, taxonomy), tokens: [...distinctiveTokens(jdText)].sort() };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A sortable end-then-start key from a dates string ("Jul - Aug 2026", "2024 - 2025", "2018"). */
function dateKey(dates: string | null): [number, number] {
  const text = (dates ?? "").toLowerCase();
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  if (years.length === 0) return [0, 0];
  if (/present|current|now/.test(text)) return [9999, years[0]!];
  const months = [...text.matchAll(/\b([a-z]{3})[a-z]*\b/g)].map((m) => MONTHS.indexOf(m[1]!)).filter((i) => i >= 0);
  const endMonth = months.length ? months[months.length - 1]! : 11;
  return [years[years.length - 1]! * 12 + endMonth, years[0]!];
}

/** projectId -> recency rank, 0 = most recent role (score.js ranks by profile order). */
export function recencyRanks(projects: Project[]): Map<string, number> {
  const order = [...projects].sort((a, b) => {
    const [ae, as] = dateKey(a.dates);
    const [be, bs] = dateKey(b.dates);
    return be - ae || bs - as;
  });
  return new Map(order.map((p, i) => [p.id, i]));
}

export interface ScoredBullet {
  bulletId: string;
  projectId: string;
  score: number;
  /** tags + echo only: zero means the JD asks for nothing this bullet shows. */
  relevance: number;
  breakdown: { tags: number; lexical: number; strength: number; recency: number };
  matchedTags: { tag: string; demand: number; phrases: string[] }[];
  echoedWords: string[];
  /** The variant whose wording echoes the JD hardest; null when the default text wins. */
  suggestedVariant: string | null;
}

const TAPER = [1, 0.8, 0.65, 0.5, 0.4, 0.3];
const round = (n: number) => Math.round(n * 100) / 100;

function bestVariant(bullet: Bullet, jdTokens: Set<string>): string | null {
  const overlap = (text: string) => [...distinctiveTokens(text)].filter((w) => jdTokens.has(w)).length;
  let best: string | null = null;
  let bestN = overlap(bullet.text);
  for (const v of bullet.variants ?? []) {
    const n = overlap(v.text);
    if (n > bestN) [best, bestN] = [v.label, n];
  }
  return best;
}

/** Score every bullet in the bank against the JD's signals. Best first. */
export function scoreBullets(signals: JdSignals, projects: Project[]): ScoredBullet[] {
  const jdTokens = new Set(signals.tokens);
  const ranks = recencyRanks(projects);
  const scored = projects.flatMap((p) =>
    p.bullets.map((b): ScoredBullet => {
      // 1. tag demand, with diminishing returns on extra matching tags
      const demandFor = (t: string) => signals.demand[t] ?? signals.demand[normalise(t)];
      const matchedTags = b.skills
        .filter((t) => demandFor(t))
        .map((t) => ({ tag: t, demand: demandFor(t)!.demand, phrases: demandFor(t)!.phrases.slice(0, 3) }))
        .sort((x, y) => y.demand - x.demand);
      const tags = matchedTags.reduce((sum, h, i) => sum + h.demand * (TAPER[i] ?? 0.2), 0);
      // 2. lexical echo between the bullet and the JD
      const echoedWords = [...distinctiveTokens(b.text)].filter((w) => jdTokens.has(w));
      const lexical = Math.min(echoedWords.length, 6) * 0.35;
      // 3. nudges
      const strength = ((b.strength ?? 3) - 3) * 0.6;
      const recency = Math.max(0, 1.5 - (ranks.get(p.id) ?? 99) * 0.25);
      return {
        bulletId: b.id,
        projectId: p.id,
        score: round(tags + lexical + strength + recency),
        relevance: round(tags + lexical),
        breakdown: { tags: round(tags), lexical: round(lexical), strength: round(strength), recency: round(recency) },
        matchedTags,
        echoedWords: echoedWords.slice(0, 8),
        suggestedVariant: bestVariant(b, jdTokens),
      };
    }),
  );
  return scored.sort((a, b) => b.score - a.score);
}
