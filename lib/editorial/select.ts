import type { Bullet } from "../types";

/**
 * Editorial selection on top of the lexical scorer (DESIGN.md §2). The scorer
 * produces a candidate set; this turns it into an ordered selection using the
 * mechanisms the corpus shows a human applying: pins against the ranking (with
 * a recorded reason), a per-org cap (CLAUDE.md rule 3), explicit excludes.
 * Every id gets a decision so the UI can answer "Why this bullet?".
 */

/** A bank bullet that knows which organisation it sits under (for per-org caps). */
export interface EditorialBullet extends Bullet {
  orgId: string;
}

export interface ScoredCandidate {
  bulletId: string;
  score: number;
}

export interface Pin {
  bulletId: string;
  /** Why the human overrode the ranking - recorded verbatim on the decision. */
  reason: string;
}

export interface ComposeSelectionInput {
  /** The role-family master's bullets, in order (the spine). */
  masterBulletIds: string[];
  /** Scorer output; a bullet absent here scores 0. */
  candidates: ScoredCandidate[];
  bank: Record<string, EditorialBullet>;
  pins?: Pin[];
  /** orgId -> max bullets from that org. Data, never a hardcoded org. */
  orgCaps?: Record<string, number>;
  excludes?: string[];
}

export type DecisionKind = "pinned" | "excluded" | "capped" | "scored" | "unknown";

export interface SelectionDecision {
  bulletId: string;
  included: boolean;
  kind: DecisionKind;
  reason: string;
  score: number;
  /** Empty string when the id is not in the bank. */
  orgId: string;
}

export interface Selection {
  /** Final order: pins first (pin order), then master order, then candidates best-first. */
  bulletIds: string[];
  pinnedIds: string[];
  decisions: SelectionDecision[];
}

/** Best first: score desc, then owner's strength desc, then id for determinism. */
export function rankBullets(
  ids: string[],
  bank: Record<string, EditorialBullet>,
  scoreOf: (id: string) => number,
): string[] {
  return [...ids].sort(
    (x, y) =>
      scoreOf(y) - scoreOf(x) ||
      (bank[y]?.strength ?? 0) - (bank[x]?.strength ?? 0) ||
      x.localeCompare(y),
  );
}

export function composeSelection(input: ComposeSelectionInput): Selection {
  const { masterBulletIds, candidates, bank } = input;
  const pins = input.pins ?? [];
  const orgCaps = input.orgCaps ?? {};
  const excludes = new Set(input.excludes ?? []);

  const scores = new Map<string, number>();
  for (const c of candidates) scores.set(c.bulletId, Math.max(scores.get(c.bulletId) ?? 0, c.score));
  const scoreOf = (id: string) => scores.get(id) ?? 0;

  const pinReason = new Map<string, string>();
  for (const p of pins) if (!pinReason.has(p.bulletId)) pinReason.set(p.bulletId, p.reason);

  const inMaster = new Set(masterBulletIds);
  const rankedCandidates = rankBullets(
    candidates.map((c) => c.bulletId).filter((id) => !inMaster.has(id)),
    bank,
    scoreOf,
  );

  // Pool order = output order.
  const pool: string[] = [];
  const seen = new Set<string>();
  for (const id of [...pins.map((p) => p.bulletId), ...masterBulletIds, ...rankedCandidates]) {
    if (!seen.has(id)) {
      seen.add(id);
      pool.push(id);
    }
  }

  const decisions = new Map<string, SelectionDecision>();
  for (const id of pool) {
    const b = bank[id];
    const score = scoreOf(id);
    if (!b) {
      decisions.set(id, { bulletId: id, included: false, kind: "unknown", reason: "not in the bullet bank", score, orgId: "" });
      continue;
    }
    const pinned = pinReason.get(id);
    if (pinned !== undefined) {
      const conflict = excludes.has(id) ? " (pin overrides an exclude)" : "";
      decisions.set(id, { bulletId: id, included: true, kind: "pinned", reason: pinned + conflict, score, orgId: b.orgId });
      continue;
    }
    if (excludes.has(id)) {
      decisions.set(id, { bulletId: id, included: false, kind: "excluded", reason: "excluded for this application", score, orgId: b.orgId });
      continue;
    }
    const origin = inMaster.has(id) ? "in master" : "scorer candidate";
    decisions.set(id, { bulletId: id, included: true, kind: "scored", reason: `${origin}, score ${score}`, score, orgId: b.orgId });
  }

  // Per-org cap: pins count toward the cap and are never capped away.
  for (const [orgId, cap] of Object.entries(orgCaps)) {
    const included = pool.filter((id) => decisions.get(id)?.included && bank[id]?.orgId === orgId);
    const pinnedCount = included.filter((id) => decisions.get(id)?.kind === "pinned").length;
    const room = Math.max(0, cap - pinnedCount);
    const unpinned = rankBullets(included.filter((id) => decisions.get(id)?.kind !== "pinned"), bank, scoreOf);
    for (const id of unpinned.slice(room)) {
      const d = decisions.get(id)!;
      decisions.set(id, {
        ...d,
        included: false,
        kind: "capped",
        reason: `over the ${orgId} cap of ${cap} (score ${d.score})`,
      });
    }
  }

  return {
    bulletIds: pool.filter((id) => decisions.get(id)!.included),
    pinnedIds: pool.filter((id) => decisions.get(id)!.kind === "pinned"),
    decisions: pool.map((id) => decisions.get(id)!),
  };
}
