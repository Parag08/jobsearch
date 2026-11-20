import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { getRolePlay, putRolePlay } from "../repos/role-plays";
import { setModelAnswer } from "./model-answers";
import { saveAgentRolePlay } from "./role-plays";
import { rolePlayBasis } from "../interview/role-play";

const NOW = "2026-11-20T09:00:00.000Z";
const MODEL = "I led the migration. We moved 10 PB.";
const lines = [
  { who: "interviewer" as const, say: "Tell me about it." },
  { who: "candidate" as const, say: "I led the migration and we moved 10 PB.", why: "Result first." },
  { who: "interviewer" as const, say: "Why you?" },
  { who: "candidate" as const, say: "I set the boundary.", why: "Owns it." },
];

describe("saveAgentRolePlay", () => {
  it("saves an agent play against the current model answer, with the real question first", async () => {
    const db = new FakeDb();
    await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: MODEL, source: "agent" }, NOW);
    expect(await saveAgentRolePlay({ db }, "u1", { questionId: "fit-about-yourself", lines }, NOW)).toEqual({ saved: true });
    const p = await getRolePlay(db, "u1", "fit-about-yourself");
    expect(p).toMatchObject({ source: "agent", basedOn: rolePlayBasis(MODEL) });
    expect(p?.lines[0].say).not.toBe("Tell me about it.");
  });

  it("refuses a number the evidence lacks", async () => {
    const db = new FakeDb();
    await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: MODEL, source: "agent" }, NOW);
    const bad = [lines[0], { who: "candidate" as const, say: "We moved 40 PB." }, lines[2], lines[3]];
    await expect(saveAgentRolePlay({ db }, "u1", { questionId: "fit-about-yourself", lines: bad }, NOW)).rejects.toThrow(/40 PB|40/);
  });

  it("keeps an app-built play unless forced", async () => {
    const db = new FakeDb();
    await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: MODEL, source: "agent" }, NOW);
    await putRolePlay(db, "u1", { questionId: "fit-about-yourself", lines, source: "ai", basedOn: "x", model: "m" }, NOW);
    expect(await saveAgentRolePlay({ db }, "u1", { questionId: "fit-about-yourself", lines }, NOW)).toEqual({ saved: false, keptSource: "ai" });
    expect(await saveAgentRolePlay({ db }, "u1", { questionId: "fit-about-yourself", lines, force: true }, NOW)).toEqual({ saved: true });
  });

  it("refuses an unknown question", async () => {
    const db = new FakeDb();
    await expect(saveAgentRolePlay({ db }, "u1", { questionId: "role:nope", lines }, NOW)).rejects.toThrow(/No question/);
    await expect(saveAgentRolePlay({ db }, "u1", { questionId: "no-such-bank-q", lines }, NOW)).rejects.toThrow(/No question/);
  });
});
