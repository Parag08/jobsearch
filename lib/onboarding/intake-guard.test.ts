import { describe, it, expect } from "vitest";
import { provenanceCheck, needsMetric, capStrength, MAX_UNEVIDENCED_STRENGTH } from "./intake-guard";

describe("provenanceCheck", () => {
  it("flags the numbers an LLM introduced - the exact ONBOARDING.md example", () => {
    const r = provenanceCheck("I owned the roadmap", "Drove roadmap across 3 products, +20% engagement");
    expect(r.ok).toBe(false);
    expect(r.introduced).toEqual([
      { kind: "number", value: "3" },
      { kind: "number", value: "20%" },
    ]);
  });

  it("accepts restructured wording that adds nothing", () => {
    const r = provenanceCheck(
      "so I owned the roadmap for the security product and got the critical risks from 400 down to 20",
      "Owned the security product roadmap; cut critical risks from 400+ to 20",
    );
    expect(r).toEqual({ ok: true, introduced: [] });
  });

  it("flags a tool name the user never said (naming a tool is itself a claim)", () => {
    const r = provenanceCheck(
      "I moved our services onto a container platform",
      "Migrated services to Kubernetes",
    );
    expect(r.introduced).toEqual([{ kind: "name", value: "Kubernetes" }]);
  });

  it("flags all-caps tokens like SQL and mixed-case product names like GitHub", () => {
    const r = provenanceCheck("I built the reporting dashboards", "Built SQL reporting dashboards on GitHub");
    expect(r.introduced).toEqual([
      { kind: "name", value: "SQL" },
      { kind: "name", value: "GitHub" },
    ]);
  });

  it("does not flag a sentence-initial capital, or a name the user did say in any case", () => {
    const r = provenanceCheck("we used claude for the triage bot and shipped it in singapore", "Shipped a Claude triage bot in Singapore");
    expect(r).toEqual({ ok: true, introduced: [] });
  });

  it("matches numbers by canonical form, not surface form", () => {
    expect(provenanceCheck("about 2.1 million in ACV", "Closed $2.1M ACV").ok).toBe(true);
    expect(provenanceCheck("thirty percent", "Lifted retention 30%").introduced).toEqual([{ kind: "number", value: "30%" }]);
  });

  it("reports each introduced value once, numbers before names, in bullet order", () => {
    const r = provenanceCheck("I ran the migration", "Led AWS migration of 40 services to AWS, 40 in total");
    expect(r.introduced).toEqual([
      { kind: "number", value: "40" },
      { kind: "name", value: "AWS" },
    ]);
  });
});

describe("needsMetric", () => {
  it("is true when the bullet carries no number", () => {
    expect(needsMetric("Owned the roadmap")).toBe(true);
    expect(needsMetric("Owned the roadmap for two products")).toBe(true);
  });
  it("is false when any metric-shaped number is present", () => {
    expect(needsMetric("Cut risks to 20")).toBe(false);
    expect(needsMetric("Closed $2.1M")).toBe(false);
    expect(needsMetric("+20% engagement")).toBe(false);
  });
});

describe("capStrength", () => {
  it("caps an unevidenced bullet at MAX_UNEVIDENCED_STRENGTH so it ranks below evidenced ones", () => {
    expect(MAX_UNEVIDENCED_STRENGTH).toBeLessThan(3); // below the DB default of 3
    expect(capStrength(5, true)).toBe(MAX_UNEVIDENCED_STRENGTH);
    expect(capStrength(1, true)).toBe(1);
  });
  it("leaves an evidenced bullet's strength alone", () => {
    expect(capStrength(5, false)).toBe(5);
  });
});
