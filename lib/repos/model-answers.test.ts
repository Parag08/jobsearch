import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { getModelAnswer, listModelAnswers, putModelAnswer } from "./model-answers";

describe("model answers repo", () => {
  it("keeps one answer per question, replacing in place", async () => {
    const db = new FakeDb();
    await putModelAnswer(db, "u1", { questionId: "role:a", text: "First", source: "agent" }, "2026-11-18T00:00:00Z");
    await putModelAnswer(db, "u1", { questionId: "role:a", text: "Second", source: "ai" }, "2026-11-19T00:00:00Z");
    expect(await getModelAnswer(db, "u1", "role:a")).toEqual({ questionId: "role:a", text: "Second", source: "ai", updatedAt: "2026-11-19T00:00:00Z" });
    expect(await listModelAnswers(db, "u1")).toHaveLength(1);
  });

  it("never reads another user's answer", async () => {
    const db = new FakeDb();
    await putModelAnswer(db, "u1", { questionId: "role:a", text: "Mine", source: "user" }, "2026-11-18T00:00:00Z");
    expect(await getModelAnswer(db, "u2", "role:a")).toBeNull();
    expect(await listModelAnswers(db, "u2")).toEqual([]);
  });
});
