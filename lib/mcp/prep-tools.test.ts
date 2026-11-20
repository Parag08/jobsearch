import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { stableId } from "../import/cvbuilder";
import { listAttempts } from "../repos/answers";
import type { JdExtract } from "../types";
import { handleMessage } from "./server";
import type { ToolContext } from "./tools";

/**
 * The interview-prep tools (stories, one application's prep, custom questions, briefs,
 * interaction corrections) and the two fixes to existing tools. Each: the happy path, a
 * validation error, another user sees nothing, and a re-send updates instead of duplicating.
 */

const NOW = "2026-11-20T02:00:00.000Z";
const ctxFor = (db: FakeDb, userId = "user-1", extra: Partial<ToolContext> = {}): ToolContext => ({
  db,
  userId,
  nowIso: NOW,
  scope: "write",
  customQuestionMaxChars: 300,
  ...extra,
});

async function call(ctx: ToolContext, name: string, args: unknown = {}) {
  const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx);
  const result = res!.result as { content: { text: string }[]; isError: boolean };
  return { isError: result.isError, text: result.content[0].text, data: result.isError ? null : JSON.parse(result.content[0].text) };
}

const PROJECT = stableId("project", "nutanix");
const BULLET = stableId("bullet", "nutanix-files-migration");

const jd: JdExtract = {
  company: "Cognition",
  role: "Deployed Engineer",
  roleFamily: "forward-deployed-engineering",
  sectorPath: ["IT", "AI"],
  skills: ["sql", "stakeholder management"],
  keywords: ["cross-functional"],
  seniority: null,
  visaNote: null,
  location: null,
};

/** One user's workspace: a project with a CV point, an application with its posting read and a CV. */
function seed(db: FakeDb, userId = "user-1") {
  db.seed("projects", [{ id: PROJECT, user_id: userId, name: "Files migration", org: "Nutanix", dates: "2021-2023", role: "PM", narrative: "", outcomes: [], skills: [], sector_tags: [] }]);
  db.seed("bullets", [
    { id: BULLET, user_id: userId, project_id: PROJECT, role_family: "general", text: "Aligned 4 teams cross-functional on a 30% faster migration using SQL metrics", skills: ["sql"], variants: [], strength: 4 },
  ]);
  db.seed("application_cvs", [{ id: "cv-1", user_id: userId, master_cv_id: "m1", diff: { addBulletIds: [], removeBulletIds: [], keywordsToMirror: [], summaryLine: "PM" }, bullet_ids: [BULLET], summary_line: "PM", file_path: null }]);
  db.seed("applications", [
    {
      id: "app-1",
      user_id: userId,
      company: "Cognition",
      role: "Deployed Engineer",
      sector_id: null,
      stage: "saved",
      closed_reason: null,
      jd_extract: jd,
      jd_raw: "posting",
      cv_id: "cv-1",
      referral_contact_id: null,
      next_action: null,
      saved_at: "2026-11-18",
      applied_at: null,
      updated_at: NOW,
      external_ref: "cognition-de",
    },
  ]);
}

const STORY = {
  externalRef: "nutanix-files-migration:boundary-decision",
  projectRef: "nutanix",
  situation: "Two teams each owned half of the files migration.",
  task: "I had to pick one owner without authority over either team.",
  action: "I mapped the hand-offs with both leads and got buy-in for one shared queue.",
  result: "The migration finished 30% faster.",
  provenance: "Parag, in chat 2026-11-20",
};

describe("MCP stories", () => {
  it("lists projects with their CV points", async () => {
    const db = new FakeDb();
    seed(db);
    const r = await call(ctxFor(db), "list_projects");
    expect(r.data.projects).toEqual([
      { id: PROJECT, name: "Files migration", org: "Nutanix", role: "PM", dates: "2021-2023", bullets: [{ id: BULLET, text: expect.stringContaining("30%") }] },
    ]);
    expect((await call(ctxFor(db, "user-2"), "list_projects")).data.projects).toEqual([]);
  });

  it("stores a story by projectRef, reads competencies and numbers from its words, and lists it", async () => {
    const db = new FakeDb();
    seed(db);
    const r = await call(ctxFor(db), "upsert_story", STORY);
    expect(r.isError).toBe(false);
    expect(r.data.created).toBe(true);
    expect(r.data.story).toMatchObject({ projectId: PROJECT, source: "agent", provenance: STORY.provenance, numbers: ["30%"], externalRef: STORY.externalRef });
    expect(r.data.story.competencies).toContain("influencing-without-authority");

    const listed = await call(ctxFor(db), "list_stories", { competency: "influencing-without-authority" });
    expect(listed.data.count).toBe(1);
    expect((await call(ctxFor(db), "list_stories", { projectId: "other" })).data.count).toBe(0);
  });

  it("re-sending the same externalRef updates the story in place", async () => {
    const db = new FakeDb();
    seed(db);
    const first = await call(ctxFor(db), "upsert_story", STORY);
    const again = await call(ctxFor(db), "upsert_story", { ...STORY, result: "The migration finished 30% faster and nobody was paged." });
    expect(again.data).toMatchObject({ created: false, story: { id: first.data.story.id, result: expect.stringContaining("nobody was paged") } });
    expect((await call(ctxFor(db), "list_stories")).data.count).toBe(1);
  });

  it("refuses a story without provenance or a result, an unknown competency, a number the user never said, or a project that isn't theirs", async () => {
    const db = new FakeDb();
    seed(db);
    const ctx = ctxFor(db);
    const { provenance: _p, ...noProvenance } = STORY;
    expect((await call(ctx, "upsert_story", noProvenance)).isError).toBe(true);
    expect((await call(ctx, "upsert_story", { ...STORY, result: "  " })).isError).toBe(true);
    const unknown = await call(ctx, "upsert_story", { ...STORY, competencies: ["heroism"] });
    expect(unknown.text).toMatch(/Unknown competencies: heroism/);
    const invented = await call(ctx, "upsert_story", { ...STORY, numbers: ["30%", "$2M"] });
    expect(invented.text).toMatch(/Numbers not in the story's own text: \$2M/);
    expect((await call(ctx, "upsert_story", { ...STORY, projectRef: "nowhere" })).text).toMatch(/No project/);
    expect((await call(ctx, "upsert_story", { ...STORY, bulletId: "not-a-bullet" })).text).toMatch(/No CV point/);
    expect((await call(ctx, "list_stories")).data.count).toBe(0);
  });

  it("keeps each user's stories apart", async () => {
    const db = new FakeDb();
    seed(db);
    seed(db, "user-2");
    await call(ctxFor(db), "upsert_story", STORY);
    expect((await call(ctxFor(db, "user-2"), "list_stories")).data.count).toBe(0);
    expect((await call(ctxFor(db, "user-2"), "remove_story", { externalRef: STORY.externalRef })).data).toEqual({ removed: false });
    expect((await call(ctxFor(db), "list_stories")).data.count).toBe(1);
  });

  it("removes a story by externalRef and leaves practice attempts alone", async () => {
    const db = new FakeDb();
    seed(db);
    db.seed("interview_attempts", [
      { id: "att-1", user_id: "user-1", question_id: "influence-no-authority", transcript: "t", duration_seconds: 60, scores: { structure: 3, ownership: 3, specificity: 3, impact: 3, reflection: 3, relevance: 3 }, overall: 3, strengths: [], improvements: [], model: "m", created_at: NOW },
    ]);
    await call(ctxFor(db), "upsert_story", STORY);
    expect((await call(ctxFor(db), "remove_story", { externalRef: STORY.externalRef })).data).toMatchObject({ removed: true });
    expect((await call(ctxFor(db), "list_stories")).data.count).toBe(0);
    expect(await listAttempts(db, "user-1")).toHaveLength(1);
  });
});

describe("MCP get_application_prep", () => {
  it("shows what the page shows: each competency's status and the CV lines still needing a story", async () => {
    const db = new FakeDb();
    seed(db);
    const before = await call(ctxFor(db), "get_application_prep", { externalRef: "cognition-de" });
    const byName = (r: typeof before) => Object.fromEntries(r.data.competencies.map((c: { competency: string; status: string }) => [c.competency, c.status]));
    expect(before.data.postingRead).toBe(true);
    expect(byName(before)["influencing-without-authority"]).toBe("on CV only");
    expect(before.data.cvLines).toMatchObject([{ bulletId: BULLET, needsStory: true }]);

    await call(ctxFor(db), "upsert_story", { ...STORY, bulletRef: "nutanix-files-migration" });
    const after = await call(ctxFor(db), "get_application_prep", { id: "app-1" });
    expect(byName(after)["influencing-without-authority"]).toBe("story ready");
    expect(after.data.cvLines).toMatchObject([{ bulletId: BULLET, needsStory: false, matchedBy: "bullet" }]);
    expect(after.data.summary.withStory).toBeGreaterThan(0);
  });

  it("refuses another user's application and asks for a reference", async () => {
    const db = new FakeDb();
    seed(db);
    expect((await call(ctxFor(db, "user-2"), "get_application_prep", { id: "app-1" })).isError).toBe(true);
    expect((await call(ctxFor(db), "get_application_prep", {})).isError).toBe(true);
  });
});

describe("MCP custom questions", () => {
  const Q = { externalRef: "drill:why-team-boundary", text: "Why that team boundary?", competency: "prioritisation", tag: "drill" };

  it("adds, lists and re-sends without duplicating", async () => {
    const db = new FakeDb();
    const ctx = ctxFor(db);
    const added = await call(ctx, "add_custom_question", Q);
    expect(added.data).toMatchObject({ created: true, questionId: expect.stringMatching(/^custom:/) });
    const again = await call(ctx, "add_custom_question", { ...Q, text: "Why draw the team boundary there?" });
    expect(again.data).toMatchObject({ created: false, questionId: added.data.questionId });
    const list = await call(ctx, "list_custom_questions");
    expect(list.data.questions).toEqual([
      expect.objectContaining({ questionId: added.data.questionId, text: "Why draw the team boundary there?", competency: "prioritisation", tag: "drill", externalRef: Q.externalRef }),
    ]);
  });

  it("refuses a bad competency, an empty question, and adding when custom questions are off", async () => {
    const db = new FakeDb();
    expect((await call(ctxFor(db), "add_custom_question", { ...Q, competency: "charm" })).isError).toBe(true);
    expect((await call(ctxFor(db), "add_custom_question", { ...Q, text: "   " })).isError).toBe(true);
    expect((await call(ctxFor(db, "user-1", { customQuestionMaxChars: undefined }), "add_custom_question", Q)).text).toMatch(/turned off/);
  });

  it("removes by externalRef or question id, only the caller's own", async () => {
    const db = new FakeDb();
    const added = await call(ctxFor(db), "add_custom_question", Q);
    expect((await call(ctxFor(db, "user-2"), "remove_custom_question", { questionId: added.data.questionId })).data).toEqual({ removed: false });
    expect((await call(ctxFor(db, "user-2"), "list_custom_questions")).data.questions).toEqual([]);
    expect((await call(ctxFor(db), "remove_custom_question", { externalRef: Q.externalRef })).data).toMatchObject({ removed: true });
    expect((await call(ctxFor(db), "remove_custom_question", {})).isError).toBe(true);
  });
});

describe("MCP get_brief", () => {
  it("composes today's brief without saving it, and returns nothing for a day with none saved", async () => {
    const db = new FakeDb();
    db.seed("contacts", [
      { id: "c1", user_id: "user-1", name: "Ray", network: null, company: "Cognition", role: null, location: null, warmth: "warm", status: "met", interests: [], next_followup: "2026-11-19", rolling_summary: "" },
    ]);
    const today = await call(ctxFor(db), "get_brief");
    expect(today.data).toMatchObject({ saved: false, brief: { date: "2026-11-20", items: [expect.objectContaining({ title: "Follow up with Ray" })] } });
    expect((await call(ctxFor(db), "get_brief", { date: "2026-11-01" })).data).toEqual({ saved: false, brief: null });
    expect((await call(ctxFor(db, "user-2"), "get_brief")).data.brief.items).toEqual([]);
    expect((await call(ctxFor(db), "get_brief", { date: "yesterday" })).isError).toBe(true);
  });
});

describe("MCP interaction corrections", () => {
  async function withRay() {
    const db = new FakeDb();
    const ctx = ctxFor(db);
    await call(ctx, "upsert_contact", { externalRef: "li:ray", name: "Ray Ong", company: "Cognition", nextFollowup: "2026-11-01" });
    await call(ctx, "log_interaction", { externalRef: "li:ray", date: "2026-11-10", channel: "coffee", summary: "Coffee" });
    const got = await call(ctx, "get_contact", { externalRef: "li:ray" });
    return { db, ctx, interactionId: got.data.interactions[0].id as string };
  }

  it("returns interaction ids, corrects one in place and removes one", async () => {
    const { ctx, interactionId } = await withRay();
    expect(interactionId).toEqual(expect.any(String));
    const fixed = await call(ctx, "update_interaction", { externalRef: "li:ray", interactionId, summary: "Coffee; he will intro me to the DE lead" });
    expect(fixed.data.interaction).toMatchObject({ id: interactionId, channel: "coffee", summary: "Coffee; he will intro me to the DE lead" });
    expect((await call(ctx, "get_contact", { externalRef: "li:ray" })).data.interactions).toHaveLength(1);
    expect((await call(ctx, "remove_interaction", { externalRef: "li:ray", interactionId })).data).toEqual({ removed: true });
    expect((await call(ctx, "get_contact", { externalRef: "li:ray" })).data.interactions).toEqual([]);
  });

  it("refuses an empty correction, an unknown interaction, and another user's contact", async () => {
    const { db, ctx, interactionId } = await withRay();
    expect((await call(ctx, "update_interaction", { externalRef: "li:ray", interactionId })).isError).toBe(true);
    expect((await call(ctx, "update_interaction", { externalRef: "li:ray", interactionId: "nope", summary: "x" })).text).toMatch(/No interaction/);
    expect((await call(ctxFor(db, "user-2"), "remove_interaction", { externalRef: "li:ray", interactionId })).isError).toBe(true);
    expect((await call(ctx, "get_contact", { externalRef: "li:ray" })).data.interactions).toHaveLength(1);
  });

  it("clears a stale follow-up with nextFollowup: null", async () => {
    const { ctx } = await withRay();
    const r = await call(ctx, "upsert_contact", { externalRef: "li:ray", name: "Ray Ong", nextFollowup: null });
    expect(r.data.contact.nextFollowup).toBeNull();
  });
});

describe("MCP fixes to existing tools", () => {
  it("list_interview_questions returns rubric, context and model answer text with includeAnswers", async () => {
    const db = new FakeDb();
    seed(db);
    const ctx = ctxFor(db);
    await call(ctx, "upsert_interview_questions", {
      externalRef: "cognition-de",
      questions: [{ externalRef: "cog:deep-dive", competency: "Technical depth", text: "Walk me through a migration.", lookFor: "Clear trade-offs", context: "From a candidate report", modelAnswer: "I led the files migration..." }],
    });
    const plain = await call(ctx, "list_interview_questions", { externalRef: "cognition-de" });
    expect(plain.data.questions[0]).not.toHaveProperty("modelAnswer");
    const full = await call(ctx, "list_interview_questions", { externalRef: "cognition-de", includeAnswers: true });
    expect(full.data.questions[0]).toMatchObject({ lookFor: "Clear trade-offs", context: "From a candidate report", modelAnswer: "I led the files migration..." });
  });

  it("list_interview_practice gives bank and custom questions their text", async () => {
    const db = new FakeDb();
    const ctx = ctxFor(db);
    const added = await call(ctx, "add_custom_question", { externalRef: "drill:x", text: "Why that team boundary?" });
    const r = await call(ctx, "list_interview_practice", { questionIds: ["fit-why-mba", added.data.questionId] });
    expect(r.data.questions[0].text).toEqual(expect.stringMatching(/MBA/i));
    expect(r.data.questions[1].text).toBe("Why that team boundary?");
  });

  it("a read-only token sees the new read tools but none of the writes", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctxFor(new FakeDb(), "user-1", { scope: "read" }));
    const names = (res!.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_projects", "list_stories", "get_application_prep", "list_custom_questions", "get_brief"]));
    for (const w of ["upsert_story", "remove_story", "add_custom_question", "remove_custom_question", "update_interaction", "remove_interaction"]) {
      expect(names).not.toContain(w);
    }
  });
});
