import { describe, it, expect } from "vitest";
import type { Bullet } from "../types";
import { parseClaims, technicalSurface } from "./technical";

const bullet = (id: string, text: string, skills: string[] = []): Bullet => ({
  id,
  projectId: "p1",
  roleFamily: "general",
  text,
  skills,
});

const bullets = [
  bullet("b1", "Managed a team of 11+ developers and a $500K budget to deliver migration software", ["data-migration", "budget-management"]),
  bullet("b2", "Optimised development workflow with AI tooling and JIRA, delivering 50% fewer meetings", ["automation", "ai-ml"]),
];

const extras = [
  { id: "add-skills", label: "Skills", text: "Product Management | Budget Management | Leadership" },
  { id: "add-tech", label: "Technologies", text: "AI | Kubernetes | JIRA" },
  { id: "add-lang", label: "Languages", text: "English (Native), Hindi (Native)" },
];

describe("parseClaims", () => {
  it("splits a pipe-separated CV line into individual claims", () => {
    expect(parseClaims("AI | Kubernetes | JIRA")).toEqual(["AI", "Kubernetes", "JIRA"]);
  });

  it("trims and drops empties, so a trailing pipe does not create a blank claim", () => {
    expect(parseClaims("AI |  Kubernetes |")).toEqual(["AI", "Kubernetes"]);
  });
});

describe("technicalSurface", () => {
  it("separates claims a bullet evidences from claims only the Skills line asserts", () => {
    const s = technicalSurface(bullets, extras);
    const evidenced = s.evidenced.map((c) => c.claim);
    const asserted = s.asserted.map((c) => c.claim);

    expect(evidenced).toContain("JIRA"); // named in b2's text
    expect(evidenced).toContain("Budget Management"); // matches b1's skill tag
    expect(asserted).toContain("Kubernetes"); // nowhere in any bullet
  });

  it("names the bullets behind an evidenced claim, so the answer has somewhere to start", () => {
    const s = technicalSurface(bullets, extras);
    expect(s.evidenced.find((c) => c.claim === "JIRA")?.evidencedBy).toEqual(["b2"]);
  });

  it("records which CV line each claim came from", () => {
    const s = technicalSurface(bullets, extras);
    expect(s.asserted.find((c) => c.claim === "Kubernetes")?.source).toBe("Technologies");
  });

  it("ignores lines that are not skill or technology claims", () => {
    const all = technicalSurface(bullets, extras);
    const claims = [...all.evidenced, ...all.asserted].map((c) => c.claim);
    expect(claims).not.toContain("English (Native), Hindi (Native)");
    expect(claims.some((c) => /Native/.test(c))).toBe(false);
  });

  it("matches case- and separator-insensitively, through norm()", () => {
    const s = technicalSurface([bullet("b3", "Built with AI tooling", ["ai-ml"])], [
      { id: "add-tech", label: "Technologies", text: "ai" },
    ]);
    expect(s.evidenced.map((c) => c.claim)).toEqual(["ai"]);
  });

  it("returns empty surfaces rather than throwing when there are no extras", () => {
    expect(technicalSurface(bullets, [])).toEqual({ evidenced: [], asserted: [] });
  });

  it("is the honesty rule pointed at the interview: an asserted claim is still fair game", () => {
    // The CV may legitimately carry a claim no single bullet spells out - the point is
    // that the candidate KNOWS which ones those are before someone asks.
    const s = technicalSurface(bullets, extras);
    expect(s.asserted.length).toBeGreaterThan(0);
    expect(s.asserted.every((c) => c.evidencedBy.length === 0)).toBe(true);
  });
});
