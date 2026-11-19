import { describe, it, expect, vi, beforeEach } from "vitest";

const stream = vi.fn();
vi.mock("../adapters/vercel-gateway-stream", () => ({ streamGatewayText: (...a: unknown[]) => stream(...a) }));
const create = vi.fn();
vi.mock("../adapters/llm-factory", () => ({ createLlm: (...a: unknown[]) => create(...a) }));

const { aiLlm, aiReady, aiWrite } = await import("./ai-write");
const { CANNED_TASKS } = await import("../demo/canned");

const demo = { cannedAi: true };
const owner = { cannedAi: false };
const opts = { model: "m", prompt: "p", maxOutputTokens: 10 };

beforeEach(() => {
  stream.mockReset();
  create.mockReset();
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
