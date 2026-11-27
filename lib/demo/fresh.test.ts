import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { freshVisitorDb } from "../db/demo";
import { DEMO_APPLICATION_FILES } from "./corpus";

describe("freshVisitorDb", () => {
  it("is the fictional person, spread across the pipeline, with practice and a watchlist", () => {
    const db = freshVisitorDb("2026-11-19");
    expect(JSON.stringify(db.rows("profiles"))).toContain("Maya");
    const stages = new Set(db.rows("applications").map((a) => a.stage));
    expect(stages.size).toBeGreaterThanOrEqual(4);
    expect(db.rows("sourced_jobs").length).toBeGreaterThan(0);
    expect(db.rows("interview_attempts").length).toBe(2);
  });

  it("has one pushed round (Kestrel AI) with model answers, so the company page and role-plays show", () => {
    const db = freshVisitorDb("2026-11-19");
    const round = db.rows("interview_role_questions");
    expect(round.length).toBe(5);
    expect(db.rows("applications").find((a) => a.id === round[0].application_id)?.company).toMatch(/Kestrel/);
    expect(db.rows("interview_model_answers").filter((m) => m.question_id.startsWith("role:demo-round-")).length).toBe(2);
  });

  it("gives each visitor an independent copy", () => {
    const a = freshVisitorDb("2026-11-19");
    const b = freshVisitorDb("2026-11-19");
    a.seed("watchlist", [{ company: "Only in A" }]);
    expect(b.rows("watchlist").some((w) => w.company === "Only in A")).toBe(false);
  });
});

describe("data/demo", () => {
  it("bundles every application file (corpus.ts lists them all)", () => {
    const onDisk = readdirSync(join(process.cwd(), "data", "demo", "applications")).filter((f) => f.endsWith(".json")).sort();
    expect([...DEMO_APPLICATION_FILES]).toEqual(onDisk);
  });

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

describe("a visitor's sample workspace is bounded", () => {
  it("refuses watchlist rows past the per-table cap and huge pasted postings", async () => {
    const { DEMO_DB_LIMITS } = await import("../db/demo");
    const db = freshVisitorDb("2026-11-19");
    const room = DEMO_DB_LIMITS.maxRowsPerTable - db.rows("watchlist").length;
    const rows = Array.from({ length: room }, (_, i) => ({ user_id: "u", company: `C${i}` }));
    expect((await db.from("watchlist").insert(rows)).error).toBeNull();
    expect((await db.from("watchlist").insert({ user_id: "u", company: "one too many" })).error?.message).toMatch(/demo workspace limit/);
    const jd = "j".repeat(DEMO_DB_LIMITS.maxRowChars);
    expect((await db.from("applications").insert({ user_id: "u", company: "Big", jd_raw: jd })).error?.message).toMatch(/demo workspace limit/);
  });
});
