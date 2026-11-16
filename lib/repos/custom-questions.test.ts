import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { addCustomQuestion, getCustomQuestion, listCustomQuestions, removeCustomQuestion } from "./custom-questions";

describe("custom questions repo", () => {
  it("adds a question and reads it back", async () => {
    const db = new FakeDb();
    const saved = await addCustomQuestion(db, "u1", "Why the Public Service?");
    expect(saved.text).toBe("Why the Public Service?");
    expect(saved.id).toBeTruthy();
    expect(await getCustomQuestion(db, "u1", saved.id)).toEqual(saved);
    expect((await listCustomQuestions(db, "u1")).map((q) => q.text)).toEqual(["Why the Public Service?"]);
  });

  it("never shows or removes another user's question", async () => {
    const db = new FakeDb();
    const mine = await addCustomQuestion(db, "u1", "Mine?");
    expect(await listCustomQuestions(db, "u2")).toEqual([]);
    expect(await getCustomQuestion(db, "u2", mine.id)).toBeNull();
    await removeCustomQuestion(db, "u2", mine.id);
    expect(await listCustomQuestions(db, "u1")).toHaveLength(1);
  });

  it("removes a question", async () => {
    const db = new FakeDb();
    const a = await addCustomQuestion(db, "u1", "A?");
    await addCustomQuestion(db, "u1", "B?");
    await removeCustomQuestion(db, "u1", a.id);
    expect((await listCustomQuestions(db, "u1")).map((q) => q.text)).toEqual(["B?"]);
  });
});
