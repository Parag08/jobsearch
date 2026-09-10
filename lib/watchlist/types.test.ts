import { describe, it, expect } from "vitest";
import { WatchlistEntrySchema, newWatchlistEntry } from "./types";

describe("WatchlistEntrySchema", () => {
  it("accepts a well-formed entry", () => {
    const parsed = WatchlistEntrySchema.parse({
      id: "w1",
      company: "Acme Corp",
      careersUrl: "https://boards.greenhouse.io/acmecorp",
      ats: "greenhouse",
      token: "acmecorp",
      active: true,
      addedAt: "2026-09-10",
    });
    expect(parsed.ats).toBe("greenhouse");
  });

  it("rejects an unknown ATS value and an empty company", () => {
    const base = {
      id: "w1",
      company: "Acme",
      careersUrl: "https://x.example",
      ats: "workday",
      token: null,
      active: true,
      addedAt: "2026-09-10",
    };
    expect(() => WatchlistEntrySchema.parse(base)).toThrow();
    expect(() => WatchlistEntrySchema.parse({ ...base, ats: "unknown", company: "" })).toThrow();
  });
});

describe("newWatchlistEntry", () => {
  it("derives ats + token from the careers URL and defaults active=true", () => {
    const e = newWatchlistEntry("Acme Corp", "https://jobs.lever.co/acme-labs/", "2026-09-10");
    expect(e).toEqual({
      company: "Acme Corp",
      careersUrl: "https://jobs.lever.co/acme-labs/",
      ats: "lever",
      token: "acme-labs",
      active: true,
      addedAt: "2026-09-10",
    });
  });

  it("falls back to unknown/null when the ATS cannot be derived (manual fix-up later)", () => {
    const e = newWatchlistEntry("Acme", "https://www.acme.example/careers", "2026-09-10");
    expect(e.ats).toBe("unknown");
    expect(e.token).toBeNull();
  });
});
