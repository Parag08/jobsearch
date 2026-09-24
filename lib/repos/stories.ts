import { StorySchema, type Story } from "../stories/types";
import { matchCompetencies } from "../stories/competencies";
import { extractNumbers } from "../stories/consistency";
import { many, one, type DbClient } from "./db";
import type { StoryRow } from "./rows";

export type { StoryRow };

/**
 * STAR story persistence (DESIGN.md section 3).
 *
 * Stories are CAPTURED, never generated: everything written here came from the user.
 * The only derivation this module does is reading competencies and numbers back OUT
 * of their own words - which adds no claim, it only indexes one.
 */

export type NewStory = Omit<Story, "id">;

export function toStory(r: StoryRow): Story {
  return StorySchema.parse({
    id: r.id,
    projectId: r.project_id,
    bulletId: r.bullet_id,
    situation: r.situation,
    task: r.task,
    action: r.action,
    result: r.result,
    competencies: r.competencies,
    numbers: r.numbers,
    capturedAt: r.captured_at,
  });
}

export function storyRow(userId: string, s: NewStory): Omit<StoryRow, "id"> {
  return {
    user_id: userId,
    project_id: s.projectId,
    bullet_id: s.bulletId,
    situation: s.situation,
    task: s.task,
    action: s.action,
    result: s.result,
    competencies: s.competencies,
    numbers: s.numbers,
    captured_at: s.capturedAt,
  };
}

/** What the capture form collects before competencies and numbers are derived. */
export interface StoryDraftInput {
  projectId: string;
  bulletId?: string | null;
  situation: string;
  task: string;
  action: string;
  result: string;
  capturedAt: string;
}

/**
 * Turn what the user typed into a story, deriving competencies and numbers from
 * their own text. Both derivations are lexical and additive - they label and index
 * what was written, and can never introduce a fact (token rule #2).
 */
export function draftStory(input: StoryDraftInput): NewStory {
  const all = [input.situation, input.task, input.action, input.result].join(" \n ");
  return {
    projectId: input.projectId,
    bulletId: input.bulletId ?? null,
    situation: input.situation,
    task: input.task,
    action: input.action,
    result: input.result,
    competencies: matchCompetencies(all).map((h) => h.competency),
    numbers: [...new Set(extractNumbers(all))],
    capturedAt: input.capturedAt,
  };
}

/**
 * A story with no Result is not a story - it is an anecdote. The DB enforces this
 * too (result_not_blank), but failing here gives the form something to say.
 */
export async function saveStory(db: DbClient, userId: string, story: NewStory): Promise<Story> {
  if (story.result.trim().length === 0) {
    throw new Error("saveStory: a story needs a Result - what changed because of it?");
  }
  const row = await one(
    db.from("stories").insert(storyRow(userId, story)).select().single(),
    "stories",
    "save",
  );
  return toStory(row);
}

export async function listStories(db: DbClient, userId: string): Promise<Story[]> {
  const rows = await many(
    db.from("stories").select().eq("user_id", userId).order("captured_at", { ascending: false }),
    "stories",
    "list",
  );
  return rows.map(toStory);
}
