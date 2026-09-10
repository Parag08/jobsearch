import { describe, it, expect } from "vitest";
import { prepSet } from "./prep";
import type { Bullet, JdExtract } from "../types";
import type { Story } from "./types";

const jd: JdExtract = {
  company: "Acme",
  role: "Product Manager",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["Stakeholder management"],
  keywords: ["post-mortems"],
  seniority: null,
  visaNote: null,
  location: null,
};

const bank: Record<string, Bullet> = {
  b1: { id: "b1", projectId: "p1", roleFamily: "product-management", text: "Cut 400+ risks to 20", skills: [] },
  b2: { id: "b2", projectId: "p1", roleFamily: "product-management", text: "Launched partner portal", skills: [] },
  b3: { id: "b3", projectId: "p2", roleFamily: "product-management", text: "Grew ACV $2.1M", skills: [] },
  b4: { id: "b4", projectId: "p3", roleFamily: "product-management", text: "Ran the hiring loop", skills: [] },
};

function story(id: string, projectId: string, bulletId: string | null, result: string, competencies: string[] = []): Story {
  return { id, projectId, bulletId, situation: "s", task: "t", action: "a", result, competencies, numbers: [], capturedAt: "2026-09-01" };
}

const stories: Story[] = [
  story("s1", "p1", "b1", "Went from 400 down to 20 critical risks.", ["stakeholder-management"]),
  story("s2", "p1", null, "Shipped the portal on time.", []),
  story("s3", "p2", "b3", "Closed about two million.", []),
];

describe("prepSet", () => {
  const prep = prepSet(["b1", "b2", "b3", "b4", "b-missing"], bank, stories, jd);

  it("keeps the CV's bullet order - prep is scoped to the page the interviewer read", () => {
    expect(prep.items.map((i) => i.bulletId)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(prep.unknownBulletIds).toEqual(["b-missing"]);
  });

  it("attaches stories by bulletId first", () => {
    const b1 = prep.items[0];
    expect(b1.matchedBy).toBe("bullet");
    expect(b1.stories.map((s) => s.id)).toEqual(["s1"]);
    expect(b1.needsStory).toBe(false);
  });

  it("falls back to stories from the same project", () => {
    const b2 = prep.items[1];
    expect(b2.matchedBy).toBe("project");
    // s1 is pinned to b1, so only the unpinned project story is offered
    expect(b2.stories.map((s) => s.id)).toEqual(["s2"]);
    expect(b2.needsStory).toBe(false);
  });

  it("flags a bullet with no story at all - never generates one", () => {
    const b4 = prep.items[3];
    expect(b4.matchedBy).toBe("none");
    expect(b4.stories).toEqual([]);
    expect(b4.needsStory).toBe(true);
  });

  it("reports number mismatches between each bullet and its backing stories", () => {
    expect(prep.items[0].numberIssues).toEqual([]);
    expect(prep.items[2].numberIssues).toEqual([{ storyId: "s3", unmatched: ["$2.1M"] }]);
  });

  it("includes the story gap report for the JD", () => {
    expect(prep.gaps.covered).toEqual(["stakeholder-management"]);
    expect(prep.gaps.missing).toEqual(["failure"]);
  });

  it("returns only the bullet's text - no generated prose anywhere in the set", () => {
    const json = JSON.stringify(prep);
    for (const key of Object.keys(prep.items[0])) {
      expect(["bulletId", "bullet", "stories", "matchedBy", "needsStory", "numberIssues"]).toContain(key);
    }
    expect(json).not.toMatch(/suggested|draft|generated/i);
  });
});
