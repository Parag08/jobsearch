import { describe, it, expect } from "vitest";
import { composeSelection, type EditorialBullet, type ScoredCandidate } from "./select";

function eb(id: string, orgId: string, extra: Partial<EditorialBullet> = {}): EditorialBullet {
  return { id, projectId: `p-${orgId}`, roleFamily: "product-management", text: `Text of ${id}`, skills: [], orgId, ...extra };
}

const bank: Record<string, EditorialBullet> = {
  a1: eb("a1", "org-a", { strength: 4 }),
  a2: eb("a2", "org-a", { strength: 2 }),
  a3: eb("a3", "org-a", { strength: 5 }),
  b1: eb("b1", "org-b"),
  b2: eb("b2", "org-b"),
  c1: eb("c1", "org-c"),
  c2: eb("c2", "org-c"),
};

const master = ["a1", "a2", "b1"];
const candidates: ScoredCandidate[] = [
  { bulletId: "c1", score: 9 },
  { bulletId: "a3", score: 6 },
  { bulletId: "a1", score: 4 },
  { bulletId: "b2", score: 3 },
  { bulletId: "c2", score: 1 },
];

describe("composeSelection", () => {
  it("keeps master order first, then appends candidates best-first; every id gets a decision", () => {
    const sel = composeSelection({ masterBulletIds: master, candidates, bank });
    expect(sel.bulletIds).toEqual(["a1", "a2", "b1", "c1", "a3", "b2", "c2"]);
    const ids = sel.decisions.map((d) => d.bulletId).sort();
    expect(ids).toEqual(["a1", "a2", "a3", "b1", "b2", "c1", "c2"]);
    expect(sel.decisions.every((d) => d.kind === "scored" && d.included)).toBe(true);
    // score comes from the candidate list; master bullets the scorer never surfaced score 0.
    expect(sel.decisions.find((d) => d.bulletId === "a1")?.score).toBe(4);
    expect(sel.decisions.find((d) => d.bulletId === "a2")?.score).toBe(0);
  });

  it("pins are included first, in pin order, regardless of score, with the reason recorded", () => {
    const sel = composeSelection({
      masterBulletIds: master,
      candidates,
      bank,
      pins: [
        { bulletId: "c2", reason: "reader scans for revenue numbers" },
        { bulletId: "b2", reason: "answers the stated management criterion" },
      ],
    });
    expect(sel.bulletIds.slice(0, 2)).toEqual(["c2", "b2"]);
    expect(sel.pinnedIds).toEqual(["c2", "b2"]);
    const c2 = sel.decisions.find((d) => d.bulletId === "c2");
    expect(c2).toMatchObject({ kind: "pinned", included: true, reason: "reader scans for revenue numbers" });
    // no duplicates
    expect(new Set(sel.bulletIds).size).toBe(sel.bulletIds.length);
  });

  it("excludes drop a bullet even when it is in the master or scores well", () => {
    const sel = composeSelection({ masterBulletIds: master, candidates, bank, excludes: ["a1", "c1"] });
    expect(sel.bulletIds).not.toContain("a1");
    expect(sel.bulletIds).not.toContain("c1");
    expect(sel.decisions.find((d) => d.bulletId === "c1")).toMatchObject({ kind: "excluded", included: false });
  });

  it("a pin beats an exclude and the conflict is recorded in the reason", () => {
    const sel = composeSelection({
      masterBulletIds: master,
      candidates,
      bank,
      pins: [{ bulletId: "a1", reason: "must stay" }],
      excludes: ["a1"],
    });
    expect(sel.bulletIds).toContain("a1");
    expect(sel.decisions.find((d) => d.bulletId === "a1")?.reason).toMatch(/exclude/i);
  });

  it("caps bullets per org, keeping the highest-scoring (ties on strength, then id)", () => {
    const sel = composeSelection({ masterBulletIds: master, candidates, bank, orgCaps: { "org-a": 2 } });
    // org-a: a3 (6), a1 (4) kept; a2 (0) capped.
    expect(sel.bulletIds.filter((id) => bank[id].orgId === "org-a")).toEqual(["a1", "a3"]);
    const a2 = sel.decisions.find((d) => d.bulletId === "a2");
    expect(a2).toMatchObject({ kind: "capped", included: false });
    expect(a2?.reason).toMatch(/org-a/);
    expect(a2?.reason).toMatch(/2/);
    // other orgs untouched
    expect(sel.bulletIds).toEqual(expect.arrayContaining(["b1", "b2", "c1", "c2"]));
  });

  it("pinned bullets count toward the cap but are never capped away", () => {
    const sel = composeSelection({
      masterBulletIds: master,
      candidates,
      bank,
      pins: [{ bulletId: "a2", reason: "the one bullet that mentions the JD's sector" }],
      orgCaps: { "org-a": 2 },
    });
    // a2 pinned (score 0) + a3 (6) fill the cap; a1 (4) is capped.
    expect(sel.bulletIds.filter((id) => bank[id].orgId === "org-a").sort()).toEqual(["a2", "a3"]);
    expect(sel.decisions.find((d) => d.bulletId === "a1")).toMatchObject({ kind: "capped", included: false });
  });

  it("more pins than the cap allows: all pins stay, nothing else from that org", () => {
    const sel = composeSelection({
      masterBulletIds: master,
      candidates,
      bank,
      pins: [
        { bulletId: "a1", reason: "r1" },
        { bulletId: "a2", reason: "r2" },
      ],
      orgCaps: { "org-a": 1 },
    });
    expect(sel.bulletIds.filter((id) => bank[id].orgId === "org-a")).toEqual(["a1", "a2"]);
    expect(sel.decisions.find((d) => d.bulletId === "a3")).toMatchObject({ kind: "capped", included: false });
  });

  it("ids missing from the bank are reported as unknown, never included", () => {
    const sel = composeSelection({
      masterBulletIds: ["ghost", ...master],
      candidates: [{ bulletId: "phantom", score: 99 }],
      bank,
      pins: [{ bulletId: "spectre", reason: "stale pin" }],
    });
    expect(sel.bulletIds).toEqual(master);
    for (const id of ["ghost", "phantom", "spectre"]) {
      expect(sel.decisions.find((d) => d.bulletId === id)).toMatchObject({ kind: "unknown", included: false });
    }
  });

  it("every decision carries orgId and score so the UI can explain the choice", () => {
    const sel = composeSelection({ masterBulletIds: master, candidates, bank });
    for (const d of sel.decisions) {
      expect(d.orgId).toBe(bank[d.bulletId].orgId);
      expect(typeof d.score).toBe("number");
    }
  });

  it("does not mutate its inputs", () => {
    const pins = [{ bulletId: "c2", reason: "r" }];
    const cands = [...candidates];
    composeSelection({ masterBulletIds: master, candidates: cands, bank, pins, orgCaps: { "org-a": 1 } });
    expect(cands).toEqual(candidates);
    expect(pins).toEqual([{ bulletId: "c2", reason: "r" }]);
    expect(master).toEqual(["a1", "a2", "b1"]);
  });
});
