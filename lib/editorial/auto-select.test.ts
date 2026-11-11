import { describe, it, expect } from "vitest";
import { autoSelect, tagCollision, type AutoSelectLimits, type PoolBullet } from "./auto-select";

/**
 * Whole-pool selection (findparagjob tools/cv-builder/lib/score.js autoSelect +
 * docs/cv-writing.md §2): every role represented, filled by score, per-role and
 * per-org limits, no org over its share of lines, one example per competency.
 */
const b = (id: string, projectId: string, orgId: string, score: number, skills: string[] = [], lines = 1): PoolBullet => ({
  id, projectId, orgId, score, skills, lines,
});

const limits: AutoSelectLimits = { maxBullets: 6, maxPerRole: 3, minPerRole: 1, maxOrgShare: 1, collisionOverlap: 1 };

describe("autoSelect", () => {
  it("keeps every role on the page, even one the JD scores low, then fills by score", () => {
    const pool = [
      b("n1", "nutanix", "Nutanix", 9), b("n2", "nutanix", "Nutanix", 8), b("n3", "nutanix", "Nutanix", 7),
      b("a1", "amantya", "Amantya", 0.5),
      b("v1", "valeo", "Valeo", 6),
    ];
    const s = autoSelect(pool, { ...limits, maxBullets: 4 });
    expect(s.bulletIds.sort()).toEqual(["a1", "n1", "n2", "v1"].sort());
    expect(s.decisions.find((d) => d.bulletId === "a1")!.kind).toBe("floor");
    expect(s.decisions.find((d) => d.bulletId === "n3")!.kind).toBe("budget");
  });

  it("caps bullets per role and per org (org caps are data)", () => {
    const pool = [
      b("n1", "nutanix", "Nutanix", 9), b("n2", "nutanix", "Nutanix", 8), b("n3", "nutanix", "Nutanix", 7),
      b("v1", "valeo", "Valeo", 6), b("v2", "valeo", "Valeo", 5), b("v3", "valeo", "Valeo", 4),
    ];
    const s = autoSelect(pool, { ...limits, maxPerRole: 2 }, { orgCaps: { Valeo: 1 } });
    expect(s.bulletIds.sort()).toEqual(["n1", "n2", "v1"]);
    expect(s.decisions.find((d) => d.bulletId === "n3")!.kind).toBe("role-limit");
    expect(s.decisions.find((d) => d.bulletId === "v2")!.kind).toBe("capped");
  });

  it("keeps any one org within its share of the bullet lines, counting both of its roles", () => {
    const pool = [
      b("tl1", "nutanix-tl", "Nutanix", 10, [], 2), b("tl2", "nutanix-tl", "Nutanix", 9, [], 2),
      b("mts1", "nutanix-mts", "Nutanix", 8, [], 2),
      b("v1", "valeo", "Valeo", 3, [], 2), b("v2", "valeo", "Valeo", 2.5, [], 2),
      b("t1", "touchnote", "Touchnote", 2, [], 2), b("c1", "cognizant", "Cognizant", 1, [], 2),
    ];
    const s = autoSelect(pool, { ...limits, maxOrgShare: 0.34 });
    const lines = (ids: string[]) => ids.length * 2;
    const nutanix = s.bulletIds.filter((id) => ["tl1", "tl2", "mts1"].includes(id));
    expect(lines(nutanix) / lines(s.bulletIds)).toBeLessThanOrEqual(0.34);
    // both Nutanix roles keep their floor bullet; the share trims the extra one
    expect(nutanix.sort()).toEqual(["mts1", "tl1"]);
    expect(s.decisions.find((d) => d.bulletId === "tl2")!.kind).toBe("share");
  });

  it("judges the share on the finished page, so a strong bullet is not lost for being considered early", () => {
    // Checked as it goes, n2 (9) fails the share while the page is short and the weak n3 (3)
    // passes later. Judged on the finished page, n2 stays and n3 does not.
    const pool = [
      b("n1", "nutanix", "Nutanix", 10), b("n2", "nutanix", "Nutanix", 9),
      b("a1", "a", "A", 8), b("c1", "c", "C", 7), b("d1", "d", "D", 6), b("e1", "e", "E", 5),
      b("a2", "a", "A", 4), b("n3", "nutanix", "Nutanix", 3),
    ];
    const s = autoSelect(pool, { ...limits, maxBullets: 7, maxOrgShare: 0.3 });
    expect(s.bulletIds).toContain("n2");
    expect(s.bulletIds).not.toContain("n3");
  });

  it("trims the over-share org's weakest bullet and refills the slot from another org", () => {
    const pool = [
      b("n1", "nutanix", "Nutanix", 10), b("n2", "nutanix", "Nutanix", 9), b("n3", "nutanix", "Nutanix", 8),
      b("a1", "a", "A", 2), b("c1", "c", "C", 1), b("a2", "a", "A", 0.5),
    ];
    const s = autoSelect(pool, { ...limits, maxBullets: 5, maxOrgShare: 0.5 });
    expect(s.bulletIds.sort()).toEqual(["a1", "a2", "c1", "n1", "n2"]);
    expect(s.decisions.find((d) => d.bulletId === "n3")!.kind).toBe("share");
  });

  it("takes one example per competency: a bullet telling the same story as a chosen one waits", () => {
    const pool = [
      b("m1", "nutanix", "Nutanix", 9, ["migration", "banking"]),
      b("m2", "nutanix", "Nutanix", 8, ["migration", "banking"]),
      b("x1", "nutanix", "Nutanix", 5, ["security"]),
      b("e1", "other", "Other", 4, ["migration", "engineering"]),
      b("e2", "other", "Other", 3, ["engineering"]),
      b("e3", "other", "Other", 3, ["engineering"]),
    ];
    const s = autoSelect(pool, { ...limits, maxBullets: 3, collisionOverlap: 0.5 });
    expect(s.bulletIds).toContain("x1");
    expect(s.bulletIds).not.toContain("m2");
    const d = s.decisions.find((x) => x.bulletId === "m2")!;
    expect(d.kind).toBe("collision");
    expect(d.reason).toContain("m1");
  });

  it("pins go in first, count toward limits, and are never trimmed", () => {
    const pool = [b("n1", "nutanix", "Nutanix", 9), b("n2", "nutanix", "Nutanix", 1), b("v1", "valeo", "Valeo", 5)];
    const s = autoSelect(pool, { ...limits, maxPerRole: 1 }, { pins: [{ bulletId: "n2", reason: "the hiring manager asked" }] });
    expect(s.bulletIds).toContain("n2");
    expect(s.pinnedIds).toEqual(["n2"]);
    expect(s.decisions.find((d) => d.bulletId === "n2")!.reason).toBe("the hiring manager asked");
  });

  it("uses a same-story bullet only when nothing distinct is left to fill the page", () => {
    const pool = [b("m1", "n", "N", 9, ["migration"]), b("m2", "n", "N", 8, ["migration"])];
    expect(autoSelect(pool, { ...limits, maxBullets: 2, collisionOverlap: 0.5 }).bulletIds).toEqual(["m1", "m2"]);
  });

  it("gives every bullet in the pool a decision", () => {
    const pool = [b("n1", "nutanix", "Nutanix", 9), b("n2", "nutanix", "Nutanix", 8)];
    expect(autoSelect(pool, { ...limits, maxBullets: 1 }).decisions.map((d) => d.bulletId).sort()).toEqual(["n1", "n2"]);
  });
});

describe("tagCollision", () => {
  it("weights shared tags by rarity: a tag most bullets carry says little, a rare one says a lot", () => {
    const freq = new Map([["engineering", 20], ["banking", 2], ["migration", 3]]);
    expect(tagCollision(["engineering"], ["engineering"], freq)).toBe(1);
    const commonOnly = tagCollision(["engineering", "banking"], ["engineering", "migration"], freq);
    const rareShared = tagCollision(["banking", "engineering"], ["banking", "migration"], freq);
    expect(rareShared).toBeGreaterThan(commonOnly);
  });
});
