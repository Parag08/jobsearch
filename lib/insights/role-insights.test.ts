import { describe, it, expect } from "vitest";
import type { Application, JdExtract, Project } from "../types";
import type { Taxonomy } from "../editorial/score";
import { roleFamilies, roleInsights, selectRoles, topGaps } from "./role-insights";

/**
 * The role knowledge base: across every role read so far, what one line of work asks for,
 * how often, and whether the bullet bank backs it. Rules only - no model call.
 */
const taxonomy: Taxonomy = {
  tags: {
    "customer-facing": ["customer", "client"],
    "data-migration": ["migrate", "migration"],
    experimentation: ["a/b test", "experimentation"],
  },
};

let n = 0;
const role = (company: string, title: string, family: string, skills: string[], keywords: string[] = [], demand: string[] = []): Application => {
  const jdExtract: JdExtract = {
    company, role: title, roleFamily: family, sectorPath: ["IT"], skills, keywords, seniority: null, visaNote: null, location: null,
    signals: { demand: Object.fromEntries(demand.map((t) => [t, { demand: 1, phrases: [taxonomy.tags[t]![0]!] }])), tokens: [] },
  };
  return {
    id: `a${++n}`, company, role: title, sectorId: null, stage: "saved", closedReason: null, jdExtract,
    cvVersionId: null, referralContactId: null, nextAction: null, savedAt: "2026-11-01", appliedAt: null, updatedAt: "2026-11-01",
  };
};

const projects: Project[] = [
  {
    id: "p1", name: "Bank migration", org: "Nutanix", dates: "2022 - 2024", role: "TL",
    narrative: "Led the migration programme; ran weekly Kubernetes upgrades for the platform team.",
    outcomes: [], skills: ["kubernetes"], sectorTags: [],
    bullets: [
      { id: "b1", projectId: "p1", roleFamily: "general", text: "Moved a bank onto new infrastructure with the client's team", skills: ["data-migration", "customer-facing"] },
      { id: "b2", projectId: "p1", roleFamily: "general", text: "Wrote Python tooling that cut cutover time", skills: [] },
    ],
  },
];

const fde = "forward-deployed-engineering";
const apps = [
  role("Palantir", "Forward Deployed Engineer", fde, ["Python", "SQL"], ["ontology"], ["customer-facing", "data-migration"]),
  role("OpenAI", "Forward Deployed Engineer", "Forward Deployed Engineering", ["python", "kubernetes"], [], ["customer-facing"]),
  role("Scale", "FDE, APAC", fde, ["python", "client migration"], [], []),
  role("Grab", "Product Manager", "product-management", ["sql", "a/b test"], [], []),
  { ...role("Unread", "FDE", fde, []), jdExtract: null },
];

describe("roleFamilies", () => {
  it("counts read roles per family, folding spelling variants of the same family", () => {
    expect(roleFamilies(apps)).toEqual([
      { family: fde, roles: 3 },
      { family: "product-management", roles: 1 },
    ]);
  });
});

describe("selectRoles", () => {
  it("selects by family, or by words in the title when the family label is not enough", () => {
    expect(selectRoles(apps, { family: fde }).map((a) => a.company)).toEqual(["Palantir", "OpenAI", "Scale"]);
    expect(selectRoles(apps, { title: "forward deployed" }).map((a) => a.company)).toEqual(["Palantir", "OpenAI"]);
  });
});

describe("roleInsights", () => {
  const insights = roleInsights(selectRoles(apps, { family: fde }), projects, taxonomy);
  const req = (term: string) => insights.requirements.find((r) => r.term === term)!;

  it("ranks what the roles ask for by how many of them ask, each role counted once", () => {
    expect(insights.roles).toBe(3);
    expect(req("python")).toMatchObject({ roles: 3, share: 1, source: "skill" });
    expect(insights.requirements.slice(0, 2).map((r) => r.term)).toEqual(["customer-facing", "python"]);
    expect(req("customer-facing")).toMatchObject({ roles: 3, share: 1, source: "tag" });
  });

  it("groups different wordings under the user's taxonomy tag, and keeps the wordings seen", () => {
    // Scale's "client migration" is a skill, not tag demand: it still folds into both tags.
    expect(req("data-migration").roles).toBe(2);
    expect(req("data-migration").phrases).toEqual(expect.arrayContaining(["migrate", "client migration"]));
    expect(insights.requirements.find((r) => r.term === "client migration")).toBeUndefined();
  });

  it("marks a requirement evidenced when a bullet backs it, by tag or by its own words", () => {
    expect(req("data-migration")).toMatchObject({ status: "evidenced", bulletIds: ["b1"] });
    expect(req("python")).toMatchObject({ status: "evidenced", bulletIds: ["b2"] });
  });

  it("marks it unstated when the history mentions it but no bullet says it - a wording gap", () => {
    expect(req("kubernetes")).toMatchObject({ status: "unstated", bulletIds: [], projectIds: ["p1"] });
  });

  it("marks it a gap when nothing in the bank or the history backs it", () => {
    expect(req("sql")).toMatchObject({ status: "gap", bulletIds: [], projectIds: [] });
    expect(req("ontology")).toMatchObject({ status: "gap", source: "keyword" });
  });

  it("orders by roles asking, then name, so the page is stable", () => {
    const order = insights.requirements.map((r) => [r.roles, r.term] as const);
    expect(order).toEqual([...order].sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1])));
  });
});

describe("topGaps", () => {
  it("lists what is not evidenced, most demanded first, capped", () => {
    const insights = roleInsights(selectRoles(apps, { family: fde }), projects, taxonomy);
    expect(topGaps(insights, 2).map((r) => r.term)).toEqual(["kubernetes", "ontology"]);
    expect(topGaps(insights, 10).every((r) => r.status !== "evidenced")).toBe(true);
  });
});
