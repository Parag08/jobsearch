import { describe, it, expect } from "vitest";
import { chipsFor, effectiveStrength, cvUsage, usageNote, isRecentRole, parsePointForm, strengthBand, strengthMix, todoItems } from "./display";

describe("strengthBand", () => {
  it("groups 1-5 into three bands, so the colour means something", () => {
    expect(strengthBand(5)).toBe("strong");
    expect(strengthBand(4)).toBe("strong");
    expect(strengthBand(3)).toBe("solid");
    expect(strengthBand(2)).toBe("weak");
    expect(strengthBand(1)).toBe("weak");
  });
  it("treats a missing strength as the database default (3)", () => {
    expect(strengthBand(undefined)).toBe("solid");
  });
});

describe("strengthMix", () => {
  it("counts points per band", () => {
    expect(strengthMix([{ strength: 5 }, { strength: 4 }, { strength: 3 }, {}, { strength: 1 }])).toEqual({ strong: 2, solid: 2, weak: 1 });
  });
});

describe("chipsFor", () => {
  it("labels the family and skills in sentence case", () => {
    const c = chipsFor({ roleFamily: "product-management", skills: ["metrics-kpi", "ops-execution"] });
    expect(c.family).toBe("Product management");
    expect(c.skills).toEqual(["Metrics KPI", "Ops execution"]);
    expect(c.more).toBe(0);
  });
  it("drops repeats and any skill that only repeats the family", () => {
    const c = chipsFor({ roleFamily: "product-management", skills: ["product-management", "launch", "Launch", "discovery"] });
    expect(c.skills).toEqual(["Launch", "Discovery"]);
  });
  it("shows at most `max` skills and counts the rest", () => {
    const c = chipsFor({ roleFamily: "general", skills: ["a", "b", "c", "d", "e", "f"] }, 4);
    expect(c.skills).toHaveLength(4);
    expect(c.more).toBe(2);
  });
});

describe("isRecentRole", () => {
  it("is recent when the dates mention this year, last year, or present", () => {
    expect(isRecentRole("Jul - Aug 2026", 2026)).toBe(true);
    expect(isRecentRole("2024 - 2025", 2026)).toBe(true);
    expect(isRecentRole("2019 - present", 2026)).toBe(true);
    expect(isRecentRole("2018 - 2021", 2026)).toBe(false);
    expect(isRecentRole(null, 2026)).toBe(false);
  });
});

describe("todoItems", () => {
  const roles = { r1: { name: "INSEAD", points: 1 } };
  const points = { b1: { text: "Secured CEO and operations-leadership approval for fleet-cost strategies by presenting their expected KPI impact", role: "Valeo Health" } };

  it("turns nudge kinds into plain sentences that point at the right place", () => {
    const items = todoItems(
      [
        { kind: "missing-languages", ref: null, priority: 30 },
        { kind: "thin-role", ref: "r1", priority: 40 },
        { kind: "needs-metric", ref: "b1", priority: 50 },
      ],
      { roles, points, pointsPerRole: 3 },
    );
    expect(items[0]).toEqual({ key: "missing-languages", text: "Add the languages you speak", where: null, href: null });
    expect(items[1]).toEqual({ key: "thin-role-r1", text: "Add 2 more points to INSEAD", where: "INSEAD", href: "#role-r1" });
    expect(items[2]!.text).toMatch(/^Add a number to “Secured CEO and operations-leadership approval for fleet-cost…”$/);
    expect(items[2]!.href).toBe("#point-b1");
    expect(items[2]!.where).toBe("Valeo Health");
  });

  it("says 1 more point in the singular", () => {
    const items = todoItems([{ kind: "thin-role", ref: "r1", priority: 40 }], { roles: { r1: { name: "X", points: 2 } }, points: {}, pointsPerRole: 3 });
    expect(items[0]!.text).toBe("Add 1 more point to X");
  });

  it("skips nudges that point at something no longer there", () => {
    expect(todoItems([{ kind: "needs-metric", ref: "gone", priority: 50 }], { roles: {}, points: {}, pointsPerRole: 3 })).toEqual([]);
  });
});

describe("parsePointForm", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
    return f;
  };

  it("reads and trims a valid point", () => {
    const r = parsePointForm(
      form({ text: "  Cut costs 30% by re-planning rotas  ", strength: "4", roleFamily: " Operations ", skills: "ops, scheduling , ops" }),
    );
    expect(r).toEqual({
      ok: true,
      value: { text: "Cut costs 30% by re-planning rotas", strength: 4, roleFamily: "operations", skills: ["ops", "scheduling"], variants: [] },
    });
  });

  it("refuses empty wording", () => {
    expect(parsePointForm(form({ text: "   ", strength: "3", roleFamily: "general" }))).toEqual({ ok: false, error: "Write the point before saving." });
  });

  it("refuses a strength outside 1-5", () => {
    expect(parsePointForm(form({ text: "Did 3 things", strength: "9", roleFamily: "general" }))).toMatchObject({ ok: false });
  });

  it("caps strength at 2 while the point has no number (the intake guard)", () => {
    const r = parsePointForm(form({ text: "Led the redesign", strength: "5", roleFamily: "general" }));
    expect(r.ok && r.value.strength).toBe(2);
  });

  it("defaults the family to general when left blank", () => {
    const r = parsePointForm(form({ text: "Did 3 things", strength: "3", roleFamily: "" }));
    expect(r.ok && r.value.roleFamily).toBe("general");
  });

  it("keeps variants in order and drops empty ones", () => {
    const r = parsePointForm(
      form({ text: "Did 3 things", strength: "3", roleFamily: "general", variantLabel: ["short", "", "lead"], variantText: ["Did 3", "", "  "] }),
    );
    expect(r.ok && r.value.variants).toEqual([{ label: "short", text: "Did 3" }]);
  });
});

describe("cvUsage", () => {
  it("counts sent and unsent CVs per point", () => {
    const u = cvUsage([
      { bulletIds: ["a", "b"], sentAt: "2026-11-01" },
      { bulletIds: ["a"], sentAt: null },
      { bulletIds: ["a", "c"] },
    ]);
    expect(u.a).toEqual({ sent: 1, unsent: 2 });
    expect(u.b).toEqual({ sent: 1, unsent: 0 });
    expect(u.d).toBeUndefined();
  });
});

describe("usageNote", () => {
  it("says nothing extra when no CV uses the point", () => {
    expect(usageNote(undefined)).toBe("No CV uses this point yet.");
  });
  it("says how many CVs use it and what happens to them", () => {
    expect(usageNote({ sent: 0, unsent: 1 })).toBe("It's in 1 CV. Copies already made or sent keep it; those CVs leave it out from now on.");
    expect(usageNote({ sent: 2, unsent: 1 })).toBe(
      "It's in 3 CVs (2 already sent). Copies already made or sent keep it; those CVs leave it out from now on.",
    );
  });
});

describe("effectiveStrength", () => {
  it("keeps the score of a point with a number", () => {
    expect(effectiveStrength({ text: "Cut costs 30%", strength: 5 })).toBe(5);
  });
  it("caps a point without a number at 2, as the editor does", () => {
    expect(effectiveStrength({ text: "Led the redesign", strength: 5 })).toBe(2);
    expect(effectiveStrength({ text: "Led the redesign" })).toBe(2);
  });
});
