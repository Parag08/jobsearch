import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { getRoleQuestion, listRoleQuestions, removeRoleQuestions, upsertRoleQuestions, type RoleQuestionWrite } from "./role-questions";

const q = (over: Partial<RoleQuestionWrite> = {}): RoleQuestionWrite => ({
  externalRef: "cog:deep-dive",
  round: "Technical interview",
  interviewer: "a Deployed Engineer at Cognition",
  position: 0,
  competency: "Technical depth",
  text: "Walk me through a project.",
  short: null,
  lookFor: "Depth.",
  context: null,
  source: null,
  ...over,
});

const NOW = "2026-11-18T09:00:00Z";

describe("role questions repo", () => {
  it("saves a set and reads it back", async () => {
    const db = new FakeDb();
    const r = await upsertRoleQuestions(db, "u1", "app-1", [q(), q({ externalRef: "cog:agents", position: 1, text: "Agents?" })], NOW);
    expect(r).toEqual({ created: 2, updated: 0 });
    const list = await listRoleQuestions(db, "u1");
    expect(list.map((x) => x.text)).toEqual(["Walk me through a project.", "Agents?"]);
    expect(list[0]).toMatchObject({ applicationId: "app-1", externalRef: "cog:deep-dive", interviewer: "a Deployed Engineer at Cognition" });
    expect(await getRoleQuestion(db, "u1", list[0].id)).toEqual(list[0]);
  });

  it("updates in place on the same ref, so the row id (and its answers) survive", async () => {
    const db = new FakeDb();
    await upsertRoleQuestions(db, "u1", "app-1", [q()], NOW);
    const [before] = await listRoleQuestions(db, "u1");
    const r = await upsertRoleQuestions(db, "u1", "app-1", [q({ text: "Walk me through your best project." })], "2026-11-19T09:00:00Z");
    expect(r).toEqual({ created: 0, updated: 1 });
    const [after] = await listRoleQuestions(db, "u1");
    expect(after.id).toBe(before.id);
    expect(after.text).toBe("Walk me through your best project.");
    expect(after.updatedAt).toBe("2026-11-19T09:00:00Z");
  });

  it("never shows, reads or removes another user's question", async () => {
    const db = new FakeDb();
    await upsertRoleQuestions(db, "u1", "app-1", [q()], NOW);
    const [mine] = await listRoleQuestions(db, "u1");
    expect(await listRoleQuestions(db, "u2")).toEqual([]);
    expect(await getRoleQuestion(db, "u2", mine.id)).toBeNull();
    expect(await removeRoleQuestions(db, "u2", ["cog:deep-dive"])).toBe(0);
    expect(await listRoleQuestions(db, "u1")).toHaveLength(1);
  });

  it("removes by ref and reports how many went", async () => {
    const db = new FakeDb();
    await upsertRoleQuestions(db, "u1", "app-1", [q(), q({ externalRef: "cog:agents", position: 1 })], NOW);
    expect(await removeRoleQuestions(db, "u1", ["cog:deep-dive", "cog:missing"])).toBe(1);
    expect((await listRoleQuestions(db, "u1")).map((x) => x.externalRef)).toEqual(["cog:agents"]);
  });
});
