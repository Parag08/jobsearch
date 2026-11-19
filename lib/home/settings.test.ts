import { describe, it, expect } from "vitest";
import { homeGoalsFromEnv } from "./settings";

describe("homeGoalsFromEnv", () => {
  it("reads each weekly goal that is set", () => {
    expect(homeGoalsFromEnv({ HOME_GOAL_APPLY: "5", HOME_GOAL_REACH_OUT: "3", HOME_GOAL_PRACTISE: "4" })).toEqual({ apply: 5, reachOut: 3, practise: 4 });
  });
  it("an unset goal is left out, so the dashboard shows no target for it", () => {
    expect(homeGoalsFromEnv({ HOME_GOAL_APPLY: "5" })).toEqual({ apply: 5 });
    expect(homeGoalsFromEnv({})).toEqual({});
  });
  it("a value present but unusable is an error, not a silent default", () => {
    expect(() => homeGoalsFromEnv({ HOME_GOAL_APPLY: "five" })).toThrow(/HOME_GOAL_APPLY/);
    expect(() => homeGoalsFromEnv({ HOME_GOAL_PRACTISE: "0" })).toThrow(/HOME_GOAL_PRACTISE/);
  });
});
