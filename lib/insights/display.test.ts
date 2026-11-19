import { describe, it, expect } from "vitest";
import { STATUS_LABEL, basedOn, statusCounts } from "./display";

describe("STATUS_LABEL", () => {
  it("uses the Overview's words, never the internal ones", () => {
    expect(STATUS_LABEL).toEqual({ gap: "Not on record", unstated: "Done, not on your CV", evidenced: "On your CV" });
  });
});

describe("statusCounts", () => {
  it("counts each status", () => {
    const reqs = [{ status: "gap" }, { status: "evidenced" }, { status: "evidenced" }, { status: "unstated" }] as const;
    expect(statusCounts([...reqs])).toEqual({ gap: 1, unstated: 1, evidenced: 2 });
  });
});

describe("basedOn", () => {
  it("says how many of your roles the insights come from", () => {
    expect(basedOn(2, 5)).toBe("Based on 2 of your 5 roles");
    expect(basedOn(3, 3)).toBe("Based on all 3 of your roles");
    expect(basedOn(1, 1)).toBe("Based on your 1 role");
  });
});
