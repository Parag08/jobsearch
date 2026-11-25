import { describe, expect, it } from "vitest";
import { companyWebsite, dailyShortlist, parseDailyTarget } from "./daily";
import type { SourcedJob } from "../types";

const job = (id: string, patch: Partial<SourcedJob> = {}): SourcedJob => ({
  id, source: "greenhouse", externalId: id, title: "Product Manager", company: "Acme",
  location: "Singapore", url: `https://job-boards.greenhouse.io/acme/jobs/${id}`,
  postedAt: "2026-11-20", score: 99, status: "new", ...patch,
});

describe("daily shortlist", () => {
  it("only suggests active target-company roles that match the current recipe, with no padding", () => {
    const jobs = [job("1"), job("2", { company: "Other" }), job("3", { location: null }),
      job("4", { status: "closed" }), job("5", { status: "tracked" }), job("6", { status: "dismissed" }),
      job("7", { source: "adzuna" })];
    const result = dailyShortlist(jobs, [{ name: " acme ", active: true }], [], {}, {
      cities: ["Singapore"], titles: ["Product Manager"], excluded: [], target: 6,
    });
    expect(result.ranked.map((r) => r.id)).toEqual(["1"]);
    expect(result.dismissed.map((r) => r.id)).toEqual(["6"]);
  });

  it("deduplicates, ranks by freshness rather than legacy score, and retains picks outside the cap", () => {
    const old = job("old");
    const newer = job("new", { postedAt: "2026-11-25", score: 1 });
    const result = dailyShortlist([old, newer, job("dupe", { url: newer.url + "?utm_source=ads" })],
      [{ name: "Acme", active: true }], [], { old: "picked" }, { cities: [], titles: [], excluded: [], target: 1 });
    expect(result.ranked.map((r) => r.id)).toEqual(["new"]);
    expect(result.picked.map((r) => r.id)).toEqual(["old"]);
  });

  it("validates the target without fixing it to the default and keeps only a public origin", () => {
    expect(parseDailyTarget("42")).toBe(42);
    expect(parseDailyTarget("1.5")).toBeNull();
    expect(parseDailyTarget("")).toBeNull();
    expect(companyWebsite("www.example.com/careers?email=name@example.com")).toBe("https://example.com");
    expect(companyWebsite("https://user:secret@example.com")).toBeNull();
    expect(companyWebsite("https://127.0.0.1")).toBeNull();
  });
});
