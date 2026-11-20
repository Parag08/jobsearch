import { z } from "zod";
import { getApplicationCv } from "../repos/cvs";
import { listProjects } from "../repos/projects";
import { deleteStory, draftStory, findStoryByExternalRef, getStory, listStories, saveStory, updateStory } from "../repos/stories";
import {
  findCustomQuestionByExternalRef,
  getCustomQuestion,
  listCustomQuestions,
  removeCustomQuestion,
  upsertCustomQuestion,
} from "../repos/custom-questions";
import { getBrief } from "../repos/briefs";
import { deleteInteraction, updateInteraction } from "../repos/contacts";
import { listApplications } from "../repos/applications";
import { listRoleQuestions } from "../repos/role-questions";
import { stableId } from "../import/cvbuilder";
import { canonicalNumber, extractNumbers } from "../stories/consistency";
import { competencyPrep, shownBulletText } from "../stories/prep-view";
import { prepSet } from "../stories/prep";
import { DEFAULT_COMPETENCIES, DEFAULT_VOCAB, type Story } from "../stories/types";
import { questionBank, companyTemplates, customTemplate } from "../interview/bank-data";
import { cleanQuestionText, customQuestionId, customQuestions, storedIdOf } from "../interview/custom-questions";
import { companyQuestions } from "../interview/company-questions";
import { roleQuestionId } from "../interview/role-questions";
import { composeBrief } from "./daily-brief";
import { findApplication, findContact, type AgentDeps, type ApplicationRef, type ContactRef } from "./agent-sync";
import { norm, type Bullet, type Interaction } from "../types";

/**
 * Interview prep over MCP (lib/mcp/tools.ts): projects, STAR stories, one application's prep,
 * custom questions, briefs, and corrections to logged interactions. Every read and write is
 * filtered on the caller's userId.
 *
 * Stories stay CAPTURED, never generated (DESIGN.md section 3): an agent passes on what the
 * user told it, with `provenance` saying where the facts came from. Nothing here writes
 * story text; competencies and numbers are only read back out of the words given.
 */

// ---- projects ----------------------------------------------------------------------------

/** Projects with their CV points, so a story can be attached to one (by id). */
export async function listProjectsForAgent({ db }: AgentDeps, userId: string) {
  const projects = await listProjects(db, userId);
  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      org: p.org,
      role: p.role,
      dates: p.dates,
      bullets: p.bullets.map((b) => ({ id: b.id, text: b.text })),
    })),
  };
}

// ---- stories -----------------------------------------------------------------------------

const storyOut = (s: Story) => ({
  id: s.id,
  externalRef: s.externalRef ?? null,
  projectId: s.projectId,
  bulletId: s.bulletId,
  situation: s.situation,
  task: s.task,
  action: s.action,
  result: s.result,
  competencies: s.competencies,
  numbers: s.numbers,
  capturedAt: s.capturedAt,
  source: s.source ?? "user",
  provenance: s.provenance ?? null,
  updatedAt: s.updatedAt ?? null,
});

export async function listStoriesForAgent(
  { db }: AgentDeps,
  userId: string,
  f: { projectId?: string; competency?: string; externalRef?: string },
) {
  const stories = (await listStories(db, userId)).filter(
    (s) =>
      (!f.projectId || s.projectId === f.projectId) &&
      (!f.competency || s.competencies.some((c) => norm(c) === norm(f.competency!))) &&
      (!f.externalRef || s.externalRef === f.externalRef),
  );
  return { count: stories.length, stories: stories.map(storyOut) };
}

export const STORY_LIMITS = { part: 4_000, provenance: 300, ref: 200 } as const;

export const UpsertStorySchema = z
  .object({
    externalRef: z.string().trim().min(1).max(STORY_LIMITS.ref),
    projectId: z.string().min(1).optional(),
    /** The project's id in the CVbuilder workspace (its role slug). */
    projectRef: z.string().min(1).optional(),
    bulletId: z.string().min(1).nullable().optional(),
    /** The CV point's id in the CVbuilder workspace. */
    bulletRef: z.string().min(1).optional(),
    situation: z.string().max(STORY_LIMITS.part).default(""),
    task: z.string().max(STORY_LIMITS.part).default(""),
    action: z.string().trim().min(1, "action is required: what did the user do?").max(STORY_LIMITS.part),
    result: z.string().trim().min(1, "result is required: no Result, no STAR").max(STORY_LIMITS.part),
    competencies: z.array(z.string().min(1)).max(10).optional(),
    numbers: z.array(z.string().min(1)).max(20).optional(),
    provenance: z.string().trim().min(1, "provenance is required: say where the facts came from").max(STORY_LIMITS.provenance),
  })
  .refine((s) => s.projectId || s.projectRef, "give projectId or projectRef");
export type UpsertStoryInput = z.infer<typeof UpsertStorySchema>;

/**
 * Create or update a story keyed on its externalRef. The project (and bullet) must be the
 * user's. Competencies given must be in the vocabulary; left out, they are read from the
 * text. Numbers are always read from the text; any given must appear in it, so a story can
 * never carry a figure the user didn't say.
 */
export async function upsertStoryForAgent({ db }: AgentDeps, userId: string, input: UpsertStoryInput, nowIso: string) {
  const projectId = input.projectId ?? stableId("project", input.projectRef!);
  const projects = await listProjects(db, userId);
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error(`No project ${input.projectId ?? `with projectRef ${input.projectRef}`} for this user. Call list_projects.`);
  const bulletId = input.bulletRef ? stableId("bullet", input.bulletRef) : (input.bulletId ?? null);
  if (bulletId && !projects.some((p) => p.bullets.some((b) => b.id === bulletId))) {
    throw new Error(`No CV point ${input.bulletId ?? `with bulletRef ${input.bulletRef}`} for this user. Call list_projects.`);
  }

  const draft = draftStory({
    projectId,
    bulletId,
    situation: input.situation.trim(),
    task: input.task.trim(),
    action: input.action,
    result: input.result,
    capturedAt: nowIso.slice(0, 10),
  });

  let competencies = draft.competencies;
  if (input.competencies) {
    const known = new Map(DEFAULT_COMPETENCIES.map((c) => [norm(c), c]));
    const unknown = input.competencies.filter((c) => !known.has(norm(c)));
    if (unknown.length) throw new Error(`Unknown competencies: ${unknown.join(", ")}. Use: ${DEFAULT_COMPETENCIES.join(", ")}.`);
    competencies = [...new Set(input.competencies.map((c) => known.get(norm(c))!))];
  }
  if (input.numbers) {
    const said = new Set(extractNumbers([draft.situation, draft.task, draft.action, draft.result].join(" \n ")).map(canonicalNumber));
    const missing = input.numbers.filter((n) => !said.has(canonicalNumber(n)));
    if (missing.length) throw new Error(`Numbers not in the story's own text: ${missing.join(", ")}. A story states only figures the user said.`);
  }

  const fields = { ...draft, competencies, externalRef: input.externalRef, source: "agent" as const, provenance: input.provenance, updatedAt: nowIso };
  const existing = await findStoryByExternalRef(db, userId, input.externalRef);
  if (existing) {
    const story = await updateStory(db, userId, existing.id, { ...fields, capturedAt: existing.capturedAt });
    return { created: false, story: storyOut(story) };
  }
  return { created: true, story: storyOut(await saveStory(db, userId, fields)) };
}

export async function removeStoryForAgent({ db }: AgentDeps, userId: string, ref: { id?: string; externalRef?: string }) {
  const story = ref.id ? await getStory(db, userId, ref.id) : ref.externalRef ? await findStoryByExternalRef(db, userId, ref.externalRef) : null;
  if (!story) return { removed: false };
  await deleteStory(db, userId, story.id);
  return { removed: true, id: story.id };
}

// ---- one application's prep ----------------------------------------------------------------

/**
 * What the application page's "Interview prep for this job" shows, from the same functions
 * (prepSet, competencyPrep, shownBulletText), so the two never disagree.
 */
export async function applicationPrep(deps: AgentDeps, userId: string, ref: ApplicationRef) {
  const { db } = deps;
  const app = await findApplication(deps, userId, ref);
  const [cv, projects, stories] = await Promise.all([
    app.cvVersionId ? getApplicationCv(db, userId, app.cvVersionId) : null,
    listProjects(db, userId),
    listStories(db, userId),
  ]);
  const head = { id: app.id, externalRef: app.externalRef ?? null, company: app.company, role: app.role, stage: app.stage, cvBuilt: Boolean(cv) };
  if (!app.jdExtract) return { application: head, postingRead: false, competencies: [], cvLines: [], unknownBulletIds: [] };

  const bank: Record<string, Bullet> = Object.fromEntries(projects.flatMap((p) => p.bullets).map((b) => [b.id, b]));
  const prep = prepSet(cv?.bulletIds ?? [], bank, stories, app.jdExtract, DEFAULT_VOCAB);
  const byCompetency = competencyPrep(prep, stories, questionBank.questions, DEFAULT_VOCAB);
  const line = (b: Bullet) => ({ bulletId: b.id, text: shownBulletText(cv?.diff, b) });
  const storyRef = (s: Story) => ({ id: s.id, externalRef: s.externalRef ?? null, result: s.result });
  const LABEL = { story: "story ready", bullet: "on CV only", gap: "no story yet" } as const;

  return {
    application: head,
    postingRead: true,
    summary: { competencies: byCompetency.length, withStory: byCompetency.filter((c) => c.status === "story").length },
    competencies: byCompetency.map((c) => ({
      competency: c.competency,
      status: LABEL[c.status],
      stories: c.stories.map(storyRef),
      cvLines: c.bullets.map(line),
      practiceQuestionId: c.questionId,
    })),
    cvLines: prep.items.map((i) => ({
      ...line(i.bullet),
      needsStory: i.needsStory,
      matchedBy: i.matchedBy,
      stories: i.stories.map(storyRef),
      numbersNotInStory: i.numberIssues,
    })),
    unknownBulletIds: prep.unknownBulletIds,
  };
}

// ---- custom questions ----------------------------------------------------------------------

export async function listCustomQuestionsForAgent({ db }: AgentDeps, userId: string) {
  const stored = await listCustomQuestions(db, userId);
  const asQuestions = new Map(customQuestions(stored, customTemplate).map((q) => [q.id, q]));
  return {
    questions: stored.map((s) => {
      const id = customQuestionId(s.id);
      return { questionId: id, externalRef: s.externalRef ?? null, text: s.text, competency: asQuestions.get(id)?.competency ?? null, tag: s.tag ?? null, createdAt: s.createdAt };
    }),
  };
}

export async function addCustomQuestionForAgent(
  { db }: AgentDeps,
  userId: string,
  input: { externalRef: string; text: string; competency?: string | null; tag?: string | null },
  maxChars: number | undefined,
) {
  if (!maxChars) throw new Error("Custom questions are turned off (INTERVIEW_CUSTOM_QUESTION_MAX_CHARS is not set).");
  const clean = cleanQuestionText(input.text, maxChars);
  if ("error" in clean) throw new Error(clean.error);
  const { question, created } = await upsertCustomQuestion(db, userId, { ...input, text: clean.text });
  return { created, questionId: customQuestionId(question.id), externalRef: question.externalRef ?? null, text: question.text };
}

/** By question id (`custom:<id>`) or externalRef. Answers and attempts on it are kept. */
export async function removeCustomQuestionForAgent({ db }: AgentDeps, userId: string, ref: { questionId?: string; externalRef?: string }) {
  const stored = ref.questionId
    ? await getCustomQuestion(db, userId, storedIdOf(ref.questionId) ?? ref.questionId)
    : ref.externalRef
      ? await findCustomQuestionByExternalRef(db, userId, ref.externalRef)
      : null;
  if (!stored) return { removed: false };
  await removeCustomQuestion(db, userId, stored.id);
  return { removed: true, questionId: customQuestionId(stored.id) };
}

// ---- question text, for every kind of question id ---------------------------------------------

/** Text for every question id the user can practise: bank, company, role and their own. */
export async function questionTexts({ db }: AgentDeps, userId: string): Promise<Map<string, string>> {
  const [apps, role, custom] = await Promise.all([listApplications(db, userId), listRoleQuestions(db, userId), listCustomQuestions(db, userId)]);
  const m = new Map<string, string>(questionBank.questions.map((q) => [q.id, q.text]));
  for (const q of companyQuestions(apps, companyTemplates)) m.set(q.id, q.text);
  for (const q of role) m.set(roleQuestionId(q.id), q.text);
  for (const q of custom) m.set(customQuestionId(q.id), q.text);
  return m;
}

// ---- briefs --------------------------------------------------------------------------------

/**
 * The brief for a date as it was saved, or today's composed from the app's data without
 * saving. Read-only by design: a brief is derived from roles, follow-ups and applications,
 * and regenerating it overwrites the row, so an outside write would be silently replaced.
 */
export async function getBriefForAgent({ db }: AgentDeps, userId: string, date: string, today: string) {
  const saved = await getBrief(db, userId, date);
  if (saved) return { saved: true, brief: saved };
  if (date === today) return { saved: false, brief: await composeBrief({ db }, userId, today) };
  return { saved: false, brief: null };
}

// ---- interactions ----------------------------------------------------------------------------

export async function updateInteractionForAgent(
  deps: AgentDeps,
  userId: string,
  ref: ContactRef,
  interactionId: string,
  patch: Partial<Pick<Interaction, "date" | "channel" | "summary">>,
) {
  const contact = await findContact(deps, userId, ref);
  const updated = await updateInteraction(deps.db, userId, contact.id, interactionId, patch);
  if (!updated) throw new Error(`No interaction ${interactionId} on this contact. get_contact lists their ids.`);
  return { interaction: updated };
}

export async function removeInteractionForAgent(deps: AgentDeps, userId: string, ref: ContactRef, interactionId: string) {
  const contact = await findContact(deps, userId, ref);
  return { removed: await deleteInteraction(deps.db, userId, contact.id, interactionId) };
}
