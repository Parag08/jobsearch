import { describe, expect, it } from "vitest";
import { FakeDb } from "./fake-db";
import { createMockSession, deleteMockSession, getMockSession, saveMockSession } from "./mock-sessions";
import { startMock, closeMock } from "../interview/mock";

const T0 = "2026-11-27T00:00:00.000Z";
const session = () => startMock({ id: "q1", text: "Tell me about a time." }, { tone: "neutral", maxFollowUps: 2 }, T0);

describe("mock sessions", () => {
  it("are kept per user and saved each turn", async () => {
    const db = new FakeDb();
    const id = await createMockSession(db, "u1", session(), T0);
    expect(await getMockSession(db, "u2", id)).toBeNull();
    const closed = closeMock(session(), "I led it.", T0);
    await saveMockSession(db, "u1", id, closed, T0);
    expect(await getMockSession(db, "u1", id)).toMatchObject({ status: "done" });
    await deleteMockSession(db, "u1", id);
    expect(await getMockSession(db, "u1", id)).toBeNull();
  });

  it("clear a user's abandoned interviews when a new one starts", async () => {
    const db = new FakeDb();
    const old = await createMockSession(db, "u1", session(), T0);
    const other = await createMockSession(db, "u2", session(), T0);
    await createMockSession(db, "u1", session(), "2026-11-28T01:00:00.000Z");
    expect(await getMockSession(db, "u1", old)).toBeNull();
    expect(await getMockSession(db, "u2", other)).not.toBeNull();
  });
});
