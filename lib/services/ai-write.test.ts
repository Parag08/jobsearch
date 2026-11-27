import { describe, it, expect, vi, beforeEach } from "vitest";

const stream = vi.fn();
vi.mock("../adapters/vercel-gateway-stream", () => ({ streamGatewayText: (...a: unknown[]) => stream(...a) }));
const create = vi.fn();
vi.mock("../adapters/llm-factory", () => ({ createLlm: (...a: unknown[]) => create(...a) }));

const { AiCallLimitError, aiCallLimitFromEnv, aiLlm, aiReady, aiWrite } = await import("./ai-write");
const { CANNED_TASKS } = await import("../demo/canned");
const { FakeDb } = await import("../repos/fake-db");

let db = new FakeDb();
const demo = { cannedAi: true, get db() { return db; }, userId: "demo" };
const owner = { cannedAi: false, get db() { return db; }, userId: "u1" };
const opts = { model: "m", prompt: "p", maxOutputTokens: 10 };

beforeEach(() => {
  stream.mockReset();
  create.mockReset();
  db = new FakeDb();
  vi.unstubAllEnvs();
});

describe("aiWrite in the public demo", () => {
  it("never reaches a provider, for any task, even with a key set", async () => {
    vi.useFakeTimers();
    for (const task of CANNED_TASKS) {
      const p = aiWrite(demo, task, opts, { candidates: ["result"], draft: "Result: it worked." }, { AI_GATEWAY_API_KEY: "real" });
      await vi.runAllTimersAsync();
      expect((await p).length).toBeGreaterThan(0);
    }
    vi.useRealTimers();
    expect(stream).not.toHaveBeenCalled();
  });

  it("reads postings by rules, never through createLlm", async () => {
    const llm = aiLlm(demo, () => ({ tags: {} }), { AI_GATEWAY_API_KEY: "real" });
    await llm!.extractJd("Product Manager\nCompany: Lumen Bank\nSingapore");
    expect(create).not.toHaveBeenCalled();
  });

  it("is always ready, key or not", () => {
    expect(aiReady(demo, {})).toBe(true);
  });
});

describe("aiWrite for a signed-in user", () => {
  it("streams from the gateway and joins the pieces", async () => {
    stream.mockImplementation(async function* () {
      yield "hel";
      yield "lo";
    });
    expect(await aiWrite(owner, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" })).toBe("hello");
  });

  it("is not ready without a key, and says so if called", async () => {
    expect(aiReady(owner, {})).toBe(false);
    await expect(aiWrite(owner, "probe", opts, {}, {})).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });
});

describe("the per-user AI call limit", () => {
  const reply = () =>
    stream.mockImplementation(async function* () {
      yield "ok";
    });

  it("refuses calls past the limit without reaching the provider", async () => {
    vi.stubEnv("AI_CALL_LIMIT", "3");
    reply();
    for (let i = 0; i < 3; i++) await aiWrite(owner, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" });
    for (let i = 0; i < 5; i++) {
      await expect(aiWrite(owner, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" })).rejects.toBeInstanceOf(AiCallLimitError);
    }
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it("counts each user separately and frees calls once the window passes", async () => {
    vi.stubEnv("AI_CALL_LIMIT", "1");
    vi.stubEnv("AI_CALL_WINDOW_SECONDS", "60");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-27T00:00:00Z"));
    reply();
    await aiWrite(owner, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" });
    await aiWrite({ ...owner, userId: "u2" }, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" });
    const refused = await aiWrite(owner, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AiCallLimitError);
    expect((refused as InstanceType<typeof AiCallLimitError>).retryAfterSec).toBe(60);
    vi.setSystemTime(new Date("2026-11-27T00:01:01Z"));
    await aiWrite(owner, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" });
    vi.useRealTimers();
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it("limits the posting reader too", async () => {
    vi.stubEnv("AI_CALL_LIMIT", "1");
    const extractJd = vi.fn(async () => ({}));
    create.mockReturnValue({ lastUsage: null, onUsage: () => () => undefined, extractJd, extractJdMeasured: vi.fn(), summarizeNode: vi.fn(), summarizeNodeMeasured: vi.fn() });
    const llm = aiLlm(owner, () => ({}), { AI_GATEWAY_API_KEY: "k" })!;
    await llm.extractJd("a posting");
    await expect(llm.extractJd("a posting")).rejects.toBeInstanceOf(AiCallLimitError);
    expect(extractJd).toHaveBeenCalledTimes(1);
  });

  it("is refused when the database will not record the call for this user", async () => {
    reply();
    const refusing = { ...owner, db: { rpc: async () => ({ data: null, error: null }) } as unknown as InstanceType<typeof FakeDb> };
    await expect(aiWrite(refusing, "probe", opts, {}, { AI_GATEWAY_API_KEY: "k" })).rejects.toBeInstanceOf(AiCallLimitError);
    expect(stream).not.toHaveBeenCalled();
  });

  it("never lets a direct caller record more than the daily ceiling", async () => {
    const { takeAiCall } = await import("../repos/ai-calls");
    const at = new Date(Date.now() - 3_600_000).toISOString();
    db.seed("ai_calls", Array.from({ length: 4998 }, () => ({ user_id: "u1", at })));
    let allowed = 0;
    for (let i = 0; i < 5; i++) if ((await takeAiCall(db, "u1", { calls: 1_000_000, windowSeconds: 60 })).allowed) allowed++;
    expect(allowed).toBe(2);
    expect(aiCallLimitFromEnv({ AI_CALL_LIMIT: "999999" }).calls).toBe(5000);
  });

  it("reads its limit from the deployment env, with safe defaults", () => {
    expect(aiCallLimitFromEnv({})).toEqual({ calls: 100, windowSeconds: 3600 });
    expect(aiCallLimitFromEnv({ AI_CALL_LIMIT: "20", AI_CALL_WINDOW_SECONDS: "600" })).toEqual({ calls: 20, windowSeconds: 600 });
    expect(aiCallLimitFromEnv({ AI_CALL_LIMIT: "-1", AI_CALL_WINDOW_SECONDS: "999999" })).toEqual({ calls: 100, windowSeconds: 86_400 });
  });
});
