import { norm, type Bullet } from "../types";
import { matchCompetencies } from "./competencies";
import type { PrepSet } from "./prep";
import { DEFAULT_VOCAB, type Competency, type CompetencyVocab, type Story } from "./types";

/** story = a captured story covers it; bullet = only a line on this CV does; gap = nothing does. */
export type CompetencyStatus = "story" | "bullet" | "gap";

export interface CompetencyPrep {
  competency: Competency;
  status: CompetencyStatus;
  /** Stories that cover this competency (from the gap report). */
  stories: Story[];
  /** Bullets on THIS application's CV whose text or skills evidence the competency. */
  bullets: Bullet[];
  /** First question-bank question with the same competency label, for practice; null if none. */
  questionId: string | null;
}

/**
 * The application page's prep, arranged by competency: for each one the JD demands,
 * the story to tell, else the CV line to build one from, else an honest gap - plus the
 * question to practise it on. Lexical and zero-token; never generates an answer.
 * Order follows the gap report (vocab order).
 */
export function competencyPrep(
  prep: PrepSet,
  stories: Story[],
  questions: readonly { id: string; competency: string }[],
  vocab: CompetencyVocab = DEFAULT_VOCAB,
): CompetencyPrep[] {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const bulletHits = prep.items.map((i) => ({
    bullet: i.bullet,
    competencies: new Set(
      matchCompetencies(`${i.bullet.text} ${i.bullet.skills.join(" ")}`, vocab).map((h) => norm(h.competency)),
    ),
  }));

  return Object.entries(prep.gaps.storiesByCompetency).map(([competency, storyIds]) => {
    const key = norm(competency);
    const covering = storyIds.map((id) => byId.get(id)).filter((s): s is Story => s !== undefined);
    const bullets = bulletHits.filter((h) => h.competencies.has(key)).map((h) => h.bullet);
    const status: CompetencyStatus = covering.length > 0 ? "story" : bullets.length > 0 ? "bullet" : "gap";
    const question = questions.find((q) => norm(q.competency) === key);
    return { competency, status, stories: covering, bullets, questionId: question?.id ?? null };
  });
}
