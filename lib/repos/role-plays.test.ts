import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { getRolePlay, listRolePlays, putRolePlay } from "./role-plays";

const lines = [
  { who: "interviewer" as const, say: "Q?" },
  { who: "candidate" as const, say: "A.", why: "w" },
];

describe("role plays repo", () => {
  it("one per user and question, replaced in place", async () => {
    const db = new FakeDb();
    await putRolePlay(db, "u1", { questionId: "role:1", lines, source: "ai", basedOn: "abc", model: "m" }, "2026-11-20T10:00:00.000Z");
    await putRolePlay(db, "u1", { questionId: "role:1", lines: [...lines, ...lines], source: "agent", basedOn: "def", model: null }, "2026-11-20T11:00:00.000Z");
    const r = await getRolePlay(db, "u1", "role:1");
    expect(r).toMatchObject({ questionId: "role:1", source: "agent", basedOn: "def", model: null, updatedAt: "2026-11-20T11:00:00.000Z" });
    expect(r?.lines).toHaveLength(4);
    expect(db.rows("interview_role_plays")).toHaveLength(1);
    expect(await getRolePlay(db, "u2", "role:1")).toBeNull();
    expect(await listRolePlays(db, "u1")).toHaveLength(1);
  });
});
