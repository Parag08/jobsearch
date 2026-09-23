import { norm, type Bullet } from "../types";

/**
 * The technical surface of a CV: every skill and technology the page claims, split
 * by whether a bullet actually evidences it.
 *
 * This is the honesty rule (CLAUDE.md rule 3) turned around to face the interview.
 * The CV may legitimately carry a claim no single bullet spells out - a Skills line
 * exists to be scanned. The danger is not the claim; it is not KNOWING which claims
 * have nothing behind them when someone asks "tell me about your Kubernetes work".
 */

/** cv_extras entry: the tailorable closing blocks of the CV (Skills, Technologies, ...). */
export interface CvExtra {
  id: string;
  label: string;
  text: string;
}

export interface ClaimCheck {
  /** The claim as written on the CV. */
  claim: string;
  /** Which CV line it came from, e.g. "Technologies". */
  source: string;
  /** Ids of bullets that evidence it; empty for an asserted claim. */
  evidencedBy: string[];
}

export interface TechnicalSurface {
  /** At least one bullet names it - you have somewhere to start. */
  evidenced: ClaimCheck[];
  /** Nothing in the bank names it - still fair game, so have an answer ready. */
  asserted: ClaimCheck[];
}

/** Only these CV lines make technical claims; Languages and Interests do not. */
const CLAIM_LINES = /^(skills?|technolog)/i;

/** Split a pipe-separated CV line into claims, trimming and dropping empties. */
export function parseClaims(line: string): string[] {
  return line
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * norm() plus separators flattened, so the skill tag `budget-management` matches the
 * CV claim `Budget Management`. Identical treatment to lex() in lib/stories/competencies.ts;
 * both sides of every comparison go through it.
 */
export function lexical(s: string): string {
  return norm(s).replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

/** A claim is evidenced when a bullet's skill tags or text name it. */
function evidencedBy(claim: string, bullets: Bullet[]): string[] {
  const needle = lexical(claim);
  if (!needle) return [];
  return bullets
    .filter(
      (b) => b.skills.some((s) => lexical(s) === needle) || lexical(b.text).includes(needle),
    )
    .map((b) => b.id);
}

/**
 * Split the CV's technical claims into evidenced and asserted. Zero tokens, purely
 * lexical (token rule #2) - the same matching `norm()` gives the rest of the system.
 */
export function technicalSurface(bullets: Bullet[], extras: CvExtra[]): TechnicalSurface {
  const surface: TechnicalSurface = { evidenced: [], asserted: [] };

  for (const extra of extras) {
    if (!CLAIM_LINES.test(extra.label)) continue;
    for (const claim of parseClaims(extra.text)) {
      const ids = evidencedBy(claim, bullets);
      const check: ClaimCheck = { claim, source: extra.label, evidencedBy: ids };
      (ids.length > 0 ? surface.evidenced : surface.asserted).push(check);
    }
  }
  return surface;
}
