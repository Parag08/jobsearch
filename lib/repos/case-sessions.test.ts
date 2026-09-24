import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { createCaseSession, finishCaseSession, getCaseSession, listCaseSessions, saveCaseSession } from "./case-sessions";
import type { CaseSession } from "../interview/case-session";

const session: CaseSession = {
  caseId: "bain-ledgerline-target-screen",
  index: 0,
  status: "running",
  turns: [{ role: "interviewer", text: "Our client...", questionId: "structure", at: "2026-09-24T10:00:00.000Z" }],
  mathChecks: [],
};

const scores = { structure: 4, analytics: 3, creativity: 4, judgement: 3, synthesis: 4, drive: 5 };

describe("case sessions repo", () => {
  it("creates a running session for a user", async () => {
    const db = new FakeDb();
    const s = await createCaseSession(db, "u1", session);
    expect(s).toMatchObject({ caseId: session.caseId, status: "running", overall: null });
    expect(s.session.turns).toHaveLength(1);
    expect(db.rows("case_sessions")[0]).toMatchObject({ user_id: "u1", case_id: session.caseId });
  });

  it("saves progress in place", async () => {
    const db = new FakeDb();
    const s = await createCaseSession(db, "u1", session);
    const moved: CaseSession = { ...session, index: 1 };
    await saveCaseSession(db, "u1", s.id, moved);
    expect((await getCaseSession(db, "u1", s.id))?.session.index).toBe(1);
    expect(db.rows("case_sessions")).toHaveLength(1);
  });

  it("finishing stores the debrief and marks the session done", async () => {
    const db = new FakeDb();
    const s = await createCaseSession(db, "u1", session);
    await finishCaseSession(db, "u1", s.id, {
      session: { ...session, status: "done" },
      scores,
      overall: 3.8,
      strengths: ["Clear structure"],
      improvements: ["Say the so-what"],
      perQuestion: [{ questionId: "structure", note: "Good." }],
      model: "m",
    });
    const done = await getCaseSession(db, "u1", s.id);
    expect(done).toMatchObject({ status: "done", overall: 3.8, scores, strengths: ["Clear structure"] });
  });

  it("never returns another user's session", async () => {
    const db = new FakeDb();
    const s = await createCaseSession(db, "u1", session);
    expect(await getCaseSession(db, "u2", s.id)).toBeNull();
  });

  it("lists a user's sessions, optionally for one case", async () => {
    const db = new FakeDb();
    await createCaseSession(db, "u1", session);
    await createCaseSession(db, "u1", { ...session, caseId: "other" });
    await createCaseSession(db, "u2", session);
    expect(await listCaseSessions(db, "u1")).toHaveLength(2);
    expect((await listCaseSessions(db, "u1", "other")).map((s) => s.caseId)).toEqual(["other"]);
  });
});
