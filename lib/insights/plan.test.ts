import { describe, it, expect } from "vitest";
import type { Project } from "../types";
import type { RoleInsights, RoleRequirement } from "./role-insights";
import { buildPlanBrief, buildRolePlanPrompt } from "./plan";

const req = (term: string, roles: number, status: RoleRequirement["status"], extra: Partial<RoleRequirement> = {}): RoleRequirement => ({
  term, source: "skill", roles, share: roles / 4, phrases: [term], status, bulletIds: status === "evidenced" ? ["b"] : [], projectIds: [], ...extra,
});
const projects = [{ id: "p1", name: "Bank", org: "Nutanix", role: "Team Lead" }] as Project[];
const insights: RoleInsights = {
  roles: 4,
  requirements: [
    req("python", 4, "evidenced"),
    req("kubernetes", 3, "unstated", { projectIds: ["p1"], phrases: ["kubernetes", "k8s"] }),
    req("sql", 2, "gap"),
    req("terraform", 1, "gap"),
  ],
};

describe("buildPlanBrief", () => {
  it("carries the top gaps with their share and kind, and names where an unstated one is mentioned", () => {
    const brief = buildPlanBrief("forward-deployed-engineering", insights, projects, 2)!;
    expect(brief.rolesSeen).toBe(4);
    expect(brief.gaps).toEqual([
      { term: "kubernetes", askedBy: 75, kind: "unstated", phrases: ["kubernetes", "k8s"], mentionedIn: ["Team Lead, Nutanix"] },
      { term: "sql", askedBy: 50, kind: "gap", phrases: ["sql"], mentionedIn: [] },
    ]);
    expect(brief.strengths).toEqual(["python"]);
  });

  it("is null when no roles are read or nothing is unbacked", () => {
    expect(buildPlanBrief("x", { roles: 0, requirements: [] }, projects, 5)).toBeNull();
    expect(buildPlanBrief("x", { roles: 2, requirements: [req("python", 2, "evidenced")] }, projects, 5)).toBeNull();
  });
});

describe("buildRolePlanPrompt", () => {
  const prompt = buildRolePlanPrompt(buildPlanBrief("forward-deployed-engineering", insights, projects, 3)!);

  it("carries terms, shares and role names only", () => {
    expect(prompt).toContain("kubernetes (asked by 75% of roles");
    expect(prompt).toContain("Team Lead, Nutanix");
    expect(prompt).toContain("Already backed by the CV (do not plan for these): python.");
  });

  it("tells the model never to claim a gap as experience, and not to write the bullet itself", () => {
    expect(prompt).toMatch(/Never say or imply the candidate already has a skill marked GAP/);
    expect(prompt).toMatch(/Do not write the bullet and do not invent what happened/);
  });
});
