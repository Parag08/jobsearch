import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "../repos/fake-db";

// The quick mock interview through its real server actions: the session stays on the server, and
// past the per-user AI call limit no turn reaches the provider.
const stream = vi.fn();
vi.mock("@/lib/adapters/vercel-gateway-stream", () => ({ streamGatewayText: (...a: unknown[]) => stream(...a) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
let db = new FakeDb();
vi.mock("@/lib/db", () => ({ getWorkspace: async () => ({ db, userId: "u1", mode: "live", email: null, files: null, cannedAi: false }) }));

const { startMockAction, mockTurnAction } = await import("../../app/app/actions");
const QUESTION = "custom:q1";

beforeEach(() => {
  db = new FakeDb();
  db.seed("interview_custom_questions", [{ id: "q1", user_id: "u1", text: "Tell me about a conflict you resolved.", created_at: "2026-11-27T00:00:00.000Z" }]);
  stream.mockReset();
  stream.mockImplementation(async function* () {
    yield JSON.stringify({ probe: "result", say: "What was the result?" });
  });
  vi.stubEnv("AI_GATEWAY_API_KEY", "k");
  vi.stubEnv("AI_CALL_LIMIT", "2");
});

describe("mockTurnAction", () => {
  it("takes the session id, not a session the browser could replay", async () => {
    const started = await startMockAction({ questionId: QUESTION, tone: "neutral", maxFollowUps: 4 });
    expect(started.error).toBeUndefined();
    const forged = await mockTurnAction({ session: started.session, answer: "I did it." } as never);
    expect(forged.error).toMatch(/could not be found/);
    expect(stream).not.toHaveBeenCalled();
  });

  it("never reaches the provider past the limit, however often it is called", async () => {
    const started = await startMockAction({ questionId: QUESTION, tone: "neutral", maxFollowUps: 4 });
    const results = [];
    for (let i = 0; i < 4; i++) {
      // A fresh interview each time, so the follow-up cap is not what stops the calls.
      const s = i === 0 ? started : await startMockAction({ questionId: QUESTION, tone: "neutral", maxFollowUps: 4 });
      results.push(await mockTurnAction({ sessionId: s.sessionId!, answer: "We sorted it out." }));
    }
    expect(stream).toHaveBeenCalledTimes(2);
    expect(results.slice(2).every((r) => /AI limit/.test(r.error ?? ""))).toBe(true);
  });

  it("only moves a session forward: a replayed turn adds to it, it does not restart it", async () => {
    vi.stubEnv("AI_CALL_LIMIT", "100");
    const { sessionId } = await startMockAction({ questionId: QUESTION, tone: "neutral", maxFollowUps: 1 });
    await mockTurnAction({ sessionId: sessionId!, answer: "We sorted it out." });
    const again = await mockTurnAction({ sessionId: sessionId!, answer: "We sorted it out." });
    expect(again.session?.status).toBe("done");
    expect(await mockTurnAction({ sessionId: sessionId!, answer: "Again." })).toMatchObject({ error: "This interview has finished." });
    expect(stream).toHaveBeenCalledTimes(1);
  });
});
