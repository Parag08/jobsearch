import { describe, it, expect } from "vitest";
import { atsLabel, orderRoles, postedLabel, suggestedCompanies, targetSummary } from "./display";

describe("atsLabel", () => {
  it("names the boards we read daily", () => {
    expect(atsLabel("greenhouse")).toBe("Greenhouse");
    expect(atsLabel("smartrecruiters")).toBe("SmartRecruiters");
  });
  it("is null for a site we can't read, so the page says to check it by hand", () => {
    expect(atsLabel("unknown")).toBeNull();
  });
});

describe("targetSummary", () => {
  it("summarises the filters in one line", () => {
    expect(targetSummary({ targetGeos: ["Singapore"], targetTitles: ["pm", "cos"], excludedTitles: ["design"] })).toBe(
      "Singapore · 2 titles · 1 skipped",
    );
  });
  it("says when nothing filters", () => {
    expect(targetSummary({ targetGeos: [], targetTitles: [], excludedTitles: [] })).toBe("Every city and title");
  });
  it("singular title, several cities", () => {
    expect(targetSummary({ targetGeos: ["Singapore", "Dubai", "London"], targetTitles: ["pm"], excludedTitles: [] })).toBe(
      "Singapore, Dubai +1 · 1 title",
    );
  });
});

describe("postedLabel", () => {
  it("speaks in days for the last fortnight", () => {
    expect(postedLabel("2026-11-19T08:00:00Z", "2026-11-19")).toBe("Posted today");
    expect(postedLabel("2026-11-18", "2026-11-19")).toBe("Posted yesterday");
    expect(postedLabel("2026-11-10", "2026-11-19")).toBe("Posted 9 days ago");
  });
  it("gives the date when older, and nothing when unknown", () => {
    expect(postedLabel("2026-09-02", "2026-11-19")).toBe("Posted 2 Sep");
    expect(postedLabel(null, "2026-11-19")).toBeNull();
  });
});

describe("orderRoles", () => {
  it("puts shortlisted first, then by score, then newest", () => {
    const roles = [
      { id: "a", status: "new", score: null, postedAt: "2026-11-01" },
      { id: "b", status: "shortlisted", score: null, postedAt: "2026-10-01" },
      { id: "c", status: "new", score: 80, postedAt: "2026-09-01" },
      { id: "d", status: "new", score: null, postedAt: "2026-11-10" },
    ] as const;
    expect(orderRoles([...roles]).map((r) => r.id)).toEqual(["b", "c", "d", "a"]);
  });
  it("puts roles already in the pipeline last, so the ones to decide on lead", () => {
    const roles = [
      { id: "t", status: "tracked", score: 99, postedAt: "2026-11-19" },
      { id: "n", status: "new", score: null, postedAt: "2026-11-01" },
    ] as const;
    expect(orderRoles([...roles]).map((r) => r.id)).toEqual(["n", "t"]);
  });
});

describe("suggestedCompanies", () => {
  it("lists readable companies you don't watch yet, by name", () => {
    const dir = [
      { id: "1", name: "Stripe", ats: "greenhouse", token: "stripe" },
      { id: "2", name: "Acme", ats: "unknown", token: null },
      { id: "3", name: "Grab", ats: "lever", token: "grab" },
      { id: "4", name: "Bolt", ats: "ashby", token: null },
    ] as const;
    expect(suggestedCompanies([...dir], new Set(["Grab"])).map((c) => c.name)).toEqual(["Stripe"]);
  });
});
