import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { getModelAnswer } from "../repos/model-answers";
import { addCustomQuestion } from "../repos/custom-questions";
import { setModelAnswer } from "./model-answers";

const NOW = "2026-11-18T09:00:00Z";

describe("setModelAnswer", () => {
  it("saves for a bank question, and the user may always replace it", async () => {
    const db = new FakeDb();
    expect(await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: "Agent version", source: "agent" }, NOW)).toEqual({ saved: true });
    expect(await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: "My rewrite", source: "ai" }, NOW)).toEqual({ saved: true });
    expect((await getModelAnswer(db, "u1", "fit-about-yourself"))?.source).toBe("ai");
  });

  it("an agent keeps away from the user's own answer unless forced", async () => {
    const db = new FakeDb();
    await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: "Mine", source: "user" }, NOW);
    expect(await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: "Agent", source: "agent" }, NOW)).toEqual({ saved: false, keptSource: "user" });
    expect((await getModelAnswer(db, "u1", "fit-about-yourself"))?.text).toBe("Mine");
    expect(await setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: "Agent", source: "agent", force: true }, NOW)).toEqual({ saved: true });
  });

  it("refuses another user's custom question, unknown role ids, bad ids and empty or long text", async () => {
    const db = new FakeDb();
    const mine = await addCustomQuestion(db, "u1", "Why us?");
    await expect(setModelAnswer({ db }, "u2", { questionId: `custom:${mine.id}`, text: "x", source: "agent" }, NOW)).rejects.toThrow(/No question/);
    await expect(setModelAnswer({ db }, "u1", { questionId: "role:nope", text: "x", source: "agent" }, NOW)).rejects.toThrow(/No question/);
    await expect(setModelAnswer({ db }, "u1", { questionId: "DROP TABLE", text: "x", source: "agent" }, NOW)).rejects.toThrow(/Unknown question/);
    await expect(setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: "  ", source: "agent" }, NOW)).rejects.toThrow(/empty/);
    await expect(setModelAnswer({ db }, "u1", { questionId: "fit-about-yourself", text: "x".repeat(3001), source: "agent" }, NOW)).rejects.toThrow(/under 3000/);
  });
});
