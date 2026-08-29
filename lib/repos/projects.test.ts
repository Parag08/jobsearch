import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { insertBullets, insertProject, listBulletsByRoleFamily, listProjects } from "./projects";

const newProject = {
  name: "JobPilot",
  org: "Personal",
  dates: "2026",
  role: "Builder",
  narrative: "Built a job-search OS.",
  outcomes: ["shipped"],
  skills: ["typescript"],
  sectorTags: [],
};

describe("projects repo", () => {
  it("insertProject + insertBullets, then listProjects composes bullets per project", async () => {
    const db = new FakeDb();
    const p1 = await insertProject(db, "u1", newProject);
    const p2 = await insertProject(db, "u1", { ...newProject, name: "Other" });
    await insertBullets(db, "u1", p1.id, [
      { roleFamily: "product-management", text: "Shipped X", skills: ["roadmap"] },
      { roleFamily: "product-management", text: "Led Y", skills: [] },
    ]);
    const projects = await listProjects(db, "u1");
    const byName = Object.fromEntries(projects.map((p) => [p.name, p]));
    expect(projects).toHaveLength(2);
    expect(byName["JobPilot"]?.bullets).toHaveLength(2);
    expect(byName["JobPilot"]?.bullets[0]?.projectId).toBe(p1.id);
    expect(byName["Other"]?.bullets).toHaveLength(0);
    expect(p2.bullets).toEqual([]);
  });

  it("listBulletsByRoleFamily filters by user and role family", async () => {
    const db = new FakeDb();
    const p = await insertProject(db, "u1", newProject);
    await insertBullets(db, "u1", p.id, [
      { roleFamily: "product-management", text: "PM bullet", skills: [] },
      { roleFamily: "data-science", text: "DS bullet", skills: [] },
    ]);
    const pm = await listBulletsByRoleFamily(db, "u1", "product-management");
    expect(pm.map((b) => b.text)).toEqual(["PM bullet"]);
    expect(await listBulletsByRoleFamily(db, "u2", "product-management")).toEqual([]);
  });
});
