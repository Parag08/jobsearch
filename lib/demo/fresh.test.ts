import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { freshVisitorDb } from "../db/demo";

describe("freshVisitorDb", () => {
  it("is the fictional person, spread across the pipeline, with practice and a watchlist", () => {
    const db = freshVisitorDb(process.cwd(), "2026-11-19");
    expect(JSON.stringify(db.rows("profiles"))).toContain("Maya");
    const stages = new Set(db.rows("applications").map((a) => a.stage));
    expect(stages.size).toBeGreaterThanOrEqual(4);
    expect(db.rows("sourced_jobs").length).toBeGreaterThan(0);
    expect(db.rows("interview_attempts").length).toBe(2);
  });

  it("gives each visitor an independent copy", () => {
    const a = freshVisitorDb(process.cwd(), "2026-11-19");
    const b = freshVisitorDb(process.cwd(), "2026-11-19");
    a.seed("watchlist", [{ company: "Only in A" }]);
    expect(b.rows("watchlist").some((w) => w.company === "Only in A")).toBe(false);
  });
});

describe("data/demo", () => {
  it("carries none of the owner's real details", () => {
    const dir = join(process.cwd(), "data", "demo");
    const files = [
      ...readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f)),
      ...readdirSync(join(dir, "applications")).map((f) => join(dir, "applications", f)),
    ];
    const real = JSON.parse(readFileSync(join(process.cwd(), "data", "cvbuilder", "profile.json"), "utf8")) as {
      name: { first: string; last: string };
      contactLines: string[];
      experience: { org: string }[];
      education: { org: string }[];
    };
    const banned = [real.name.first, real.name.last, ...real.experience.map((o) => o.org), ...real.education.map((o) => o.org), "gmail"];
    for (const f of files) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const word of banned) expect(text, `${f} mentions ${word}`).not.toContain(word.toLowerCase());
    }
  });
});
