import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { draftStory, listStories, saveStory, toStory } from "./stories";

const base = {
  projectId: "p1",
  bulletId: null,
  situation: "Fleet cost was climbing while revenue stayed flat.",
  task: "Work out why, with two months and no diagnosis.",
  action: "Learned the operation from the dispatchers before opening a spreadsheet.",
  result: "Isolated the drivers and sized two strategies worth up to 30%.",
  competencies: ["ambiguity", "data-driven-decision"],
  numbers: ["30%"],
  capturedAt: "2026-09-24",
};

describe("stories repo", () => {
  it("saves a story and returns it with the DB identity", async () => {
    const db = new FakeDb();
    const saved = await saveStory(db, "u1", base);
    expect(saved.id).toMatch(/^fake-id-/);
    expect(saved).toMatchObject({ result: base.result, competencies: ["ambiguity", "data-driven-decision"] });
    expect(db.rows("stories")[0]).toMatchObject({ user_id: "u1", project_id: "p1" });
  });

  it("refuses a story with no Result - no Result, no STAR", async () => {
    const db = new FakeDb();
    await expect(saveStory(db, "u1", { ...base, result: "   " })).rejects.toThrow(/result/i);
    expect(db.rows("stories")).toHaveLength(0);
  });

  it("allows a story still missing Situation or Action, so a draft can be saved and finished later", async () => {
    const db = new FakeDb();
    const saved = await saveStory(db, "u1", { ...base, situation: "", action: "" });
    expect(saved.situation).toBe("");
    expect(saved.result).toBe(base.result);
  });

  it("lists only the caller's stories", async () => {
    const db = new FakeDb();
    await saveStory(db, "u1", base);
    await saveStory(db, "u2", { ...base, result: "someone else's" });
    const mine = await listStories(db, "u1");
    expect(mine).toHaveLength(1);
    expect(mine[0].result).toBe(base.result);
  });

  it("returns an empty list rather than throwing when nothing is captured yet", async () => {
    expect(await listStories(new FakeDb(), "u1")).toEqual([]);
  });

  it("maps snake_case rows back to the domain shape", () => {
    const story = toStory({
      id: "s1",
      user_id: "u1",
      project_id: "p1",
      bullet_id: null,
      situation: "s",
      task: "t",
      action: "a",
      result: "r",
      competencies: ["conflict"],
      numbers: [],
      captured_at: "2026-09-24",
    });
    expect(story).toMatchObject({ id: "s1", projectId: "p1", bulletId: null, capturedAt: "2026-09-24" });
  });
});

describe("draftStory", () => {
  it("infers competencies from what the user actually wrote", () => {
    const d = draftStory({
      projectId: "p1",
      situation: "Two teams disagreed about the roadmap",
      task: "",
      action: "I pushed back on the deadline and we renegotiated scope",
      result: "We shipped a smaller release on time",
      capturedAt: "2026-09-24",
    });
    expect(d.competencies).toContain("conflict");
  });

  it("extracts the numbers the user said, verbatim, so the CV cannot drift from the story", () => {
    const d = draftStory({
      projectId: "p1",
      situation: "",
      task: "",
      action: "Cut 400+ security risks",
      result: "Down to 20, and licensing to zero",
      capturedAt: "2026-09-24",
    });
    // verbatim, "+" and all - the schema promises the numbers as the user said them,
    // so the CV can never quietly round what the story claims.
    expect(d.numbers).toEqual(expect.arrayContaining(["400+", "20"]));
  });

  it("never invents a competency when the text carries no signal", () => {
    const d = draftStory({
      projectId: "p1",
      situation: "",
      task: "",
      action: "I attended a meeting",
      result: "It finished",
      capturedAt: "2026-09-24",
    });
    expect(d.competencies).toEqual([]);
  });
});
