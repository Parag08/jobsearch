import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { deleteBullet, insertBullets, insertProject, listBulletsByRoleFamily, listProjects, updateBullet } from "./projects";

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

describe("editing points", () => {
  const point = { roleFamily: "general", text: "Did 3 things", skills: ["a"], variants: [{ label: "short", text: "Did 3" }], strength: 3 };

  it("updateBullet changes only the given fields and returns the point", async () => {
    const db = new FakeDb();
    const p = await insertProject(db, "u1", newProject);
    const [b] = await insertBullets(db, "u1", p.id, [point]);
    const updated = await updateBullet(db, "u1", b!.id, { text: "Did 4 things", strength: 5 });
    expect(updated).toMatchObject({ id: b!.id, projectId: p.id, text: "Did 4 things", strength: 5, skills: ["a"], roleFamily: "general" });
    expect(updated.variants).toEqual([{ label: "short", text: "Did 3" }]);
    const [listed] = await listProjects(db, "u1");
    expect(listed!.bullets[0]!.text).toBe("Did 4 things");
  });

  it("updateBullet cannot touch another user's point", async () => {
    const db = new FakeDb();
    const p = await insertProject(db, "u1", newProject);
    const [b] = await insertBullets(db, "u1", p.id, [point]);
    await expect(updateBullet(db, "u2", b!.id, { text: "hijack" })).rejects.toThrow();
    const [listed] = await listProjects(db, "u1");
    expect(listed!.bullets[0]!.text).toBe("Did 3 things");
  });

  it("deleteBullet removes only the owner's point", async () => {
    const db = new FakeDb();
    const p = await insertProject(db, "u1", newProject);
    const [b1, b2] = await insertBullets(db, "u1", p.id, [point, { ...point, text: "Other 1" }]);
    await deleteBullet(db, "u2", b1!.id);
    expect((await listProjects(db, "u1"))[0]!.bullets).toHaveLength(2);
    await deleteBullet(db, "u1", b1!.id);
    const left = (await listProjects(db, "u1"))[0]!.bullets;
    expect(left.map((x) => x.id)).toEqual([b2!.id]);
  });
});
