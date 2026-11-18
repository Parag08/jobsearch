import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { upsertApplication } from "./agent-sync";
import { listRoleInterview, removeRoleInterview, saveRoleInterview } from "./role-interview";
import { RoleInterviewInputSchema } from "../interview/role-questions";

const NOW = "2026-11-18T09:00:00.000Z";
const set = (over: Record<string, unknown> = {}) =>
  RoleInterviewInputSchema.parse({
    externalRef: "cognition-de",
    round: "Technical interview",
    interviewer: "a Deployed Engineer at Cognition",
    questions: [
      { externalRef: "cog:background", competency: "Fit", text: "Walk me through your background.", lookFor: "Two minutes, ends on why DE." },
      { externalRef: "cog:deep-dive", competency: "Technical depth", text: "Walk me through something you built.", lookFor: "Depth." },
    ],
    ...over,
  });

describe("role interview service", () => {
  it("saves a set against the application, in the order sent", async () => {
    const db = new FakeDb();
    await upsertApplication({ db }, "u1", { externalRef: "cognition-de", company: "Cognition", role: "Deployed Engineer" }, "2026-11-18");
    const r = await saveRoleInterview({ db }, "u1", set(), NOW);
    expect(r).toMatchObject({ created: 2, updated: 0, application: { company: "Cognition", externalRef: "cognition-de" } });

    const { questions } = await listRoleInterview({ db }, "u1", { externalRef: "cognition-de" });
    expect(questions.map((q) => q.externalRef)).toEqual(["cog:background", "cog:deep-dive"]);
    expect(questions[0]).toMatchObject({ company: "Cognition", round: "Technical interview", interviewer: "a Deployed Engineer at Cognition" });
    expect(questions[0].questionId).toMatch(/^role:/);
  });

  it("re-pushing updates in place and keeps question ids", async () => {
    const db = new FakeDb();
    await upsertApplication({ db }, "u1", { externalRef: "cognition-de", company: "Cognition", role: "Deployed Engineer" }, "2026-11-18");
    await saveRoleInterview({ db }, "u1", set(), NOW);
    const before = (await listRoleInterview({ db }, "u1", {})).questions.map((q) => q.questionId);
    const again = await saveRoleInterview({ db }, "u1", set({ round: "Technical interview, 24 Nov" }), NOW);
    expect(again).toMatchObject({ created: 0, updated: 2 });
    const after = (await listRoleInterview({ db }, "u1", {})).questions;
    expect(after.map((q) => q.questionId)).toEqual(before);
    expect(after[0].round).toBe("Technical interview, 24 Nov");
  });

  it("refuses an application the user does not have", async () => {
    const db = new FakeDb();
    await upsertApplication({ db }, "u2", { externalRef: "cognition-de", company: "Cognition", role: "DE" }, "2026-11-18");
    await expect(saveRoleInterview({ db }, "u1", set(), NOW)).rejects.toThrow(/No application/);
  });

  it("removes by ref", async () => {
    const db = new FakeDb();
    await upsertApplication({ db }, "u1", { externalRef: "cognition-de", company: "Cognition", role: "Deployed Engineer" }, "2026-11-18");
    await saveRoleInterview({ db }, "u1", set(), NOW);
    expect(await removeRoleInterview({ db }, "u1", ["cog:background"])).toEqual({ removed: 1 });
    expect((await listRoleInterview({ db }, "u1", {})).questions).toHaveLength(1);
  });
});
