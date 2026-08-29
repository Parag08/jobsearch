import { describe, it, expect } from "vitest";
import { scoreBullet, selectBullets } from "./bullet-matcher";
import type { Bullet, JdExtract, Project } from "./types";

const jd: JdExtract = {
  company: "Grab",
  role: "PM, AI Platform",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["experimentation", "sql", "llm products"],
  keywords: ["platform", "genai"],
  seniority: null,
  visaNote: null,
  location: null,
};

function bullet(id: string, roleFamily: string, skills: string[], text = "x"): Bullet {
  return { id, projectId: "p1", roleFamily, text, skills };
}

describe("scoreBullet", () => {
  it("scores skill overlap higher than keyword overlap", () => {
    const skillHit = scoreBullet(bullet("a", "product-management", ["sql"]), jd);
    const kwHit = scoreBullet(bullet("b", "product-management", [], "built a platform"), jd);
    expect(skillHit).toBeGreaterThan(kwHit);
    expect(kwHit).toBeGreaterThan(0);
  });

  it("boosts bullets of the JD's role family", () => {
    const pm = scoreBullet(bullet("a", "product-management", ["sql"]), jd);
    const strat = scoreBullet(bullet("b", "strategy", ["sql"]), jd);
    expect(pm).toBeGreaterThan(strat);
  });

  it("gives zero to a bullet with no overlap at all", () => {
    expect(scoreBullet(bullet("a", "strategy", ["carpentry"], "built chairs"), jd)).toBe(0);
  });
});

describe("selectBullets", () => {
  const projects: Project[] = [
    {
      id: "p1",
      name: "P1",
      org: "Acme",
      dates: null,
      role: null,
      narrative: "",
      outcomes: [],
      skills: [],
      sectorTags: [],
      bullets: [
        bullet("b1", "product-management", ["sql", "experimentation"]),
        bullet("b2", "strategy", ["market entry"]),
        bullet("b3", "product-management", ["llm products"]),
        bullet("b4", "product-management", ["carpentry"]),
      ],
    },
  ];

  it("returns top-k matching bullets, best first, excluding zero scores", () => {
    const sel = selectBullets(projects, jd, 2);
    expect(sel.map((b) => b.id)).toEqual(["b1", "b3"]);
  });

  it("never returns more than k", () => {
    expect(selectBullets(projects, jd, 1)).toHaveLength(1);
  });
});
