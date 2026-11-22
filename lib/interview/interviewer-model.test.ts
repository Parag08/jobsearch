import { describe, it, expect } from "vitest";
import { interviewerModels } from "./interviewer-model";

describe("interviewerModels", () => {
  it("uses the interviewer model with its effort and token cap, and the premium model as the fallback", () => {
    expect(
      interviewerModels({
        AI_GATEWAY_INTERVIEWER_MODEL: "anthropic/claude-opus-5.5",
        AI_GATEWAY_INTERVIEWER_EFFORT: "low",
        AI_GATEWAY_INTERVIEWER_MAX_TOKENS: "2000",
        AI_GATEWAY_PREMIUM_MODEL: "mistral/mistral-medium-3.5",
      }),
    ).toEqual([
      { model: "anthropic/claude-opus-5.5", reasoningEffort: "low", maxOutputTokens: 2000 },
      { model: "mistral/mistral-medium-3.5", maxOutputTokens: 160 },
    ]);
  });

  it("with no interviewer model, uses premium alone, as before", () => {
    expect(interviewerModels({ AI_GATEWAY_PREMIUM_MODEL: "mistral/mistral-medium-3.5" })).toEqual([
      { model: "mistral/mistral-medium-3.5", maxOutputTokens: 160 },
    ]);
  });

  it("an effort needs a token cap with room for the thinking, and both must be valid", () => {
    expect(() => interviewerModels({ AI_GATEWAY_INTERVIEWER_MODEL: "a/b", AI_GATEWAY_INTERVIEWER_EFFORT: "low" })).toThrow(/AI_GATEWAY_INTERVIEWER_MAX_TOKENS/);
    expect(() => interviewerModels({ AI_GATEWAY_INTERVIEWER_MODEL: "a/b", AI_GATEWAY_INTERVIEWER_EFFORT: "lots", AI_GATEWAY_INTERVIEWER_MAX_TOKENS: "2000" })).toThrow(/EFFORT/);
    expect(() => interviewerModels({ AI_GATEWAY_INTERVIEWER_MODEL: "a/b", AI_GATEWAY_INTERVIEWER_EFFORT: "low", AI_GATEWAY_INTERVIEWER_MAX_TOKENS: "50" })).toThrow(/MAX_TOKENS/);
  });

  it("no fallback when the interviewer model is the premium model", () => {
    expect(interviewerModels({ AI_GATEWAY_INTERVIEWER_MODEL: "x/y", AI_GATEWAY_PREMIUM_MODEL: "x/y" })).toHaveLength(1);
  });
});
