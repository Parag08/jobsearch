import { describe, it, expect } from "vitest";
import { choosePrep, isConsultingFirm, prepEntries } from "./prep";

const firms = { bcg: "BCG", mckinsey: "McKinsey" };
const qs = [
  { id: "role:1", company: "Cognition", round: "Technical interview, 24 Nov" },
  { id: "company:cognition:why", company: "Cognition" },
  { id: "company:bcg:why", company: "BCG" },
  { id: "company:airwallex:why", company: "Airwallex" },
];
const apps = [
  { company: "Cognition", role: "Deployed Engineer", roleFamily: "engineering" },
  { company: "BCG", role: "Consultant", roleFamily: "consulting" },
  { company: "Airwallex", role: "PM", roleFamily: "product-management" },
];

describe("isConsultingFirm", () => {
  it("by the bank's firm names or a consulting role family", () => {
    expect(isConsultingFirm("Boston Consulting Group (BCG)", null, firms)).toBe(true);
    expect(isConsultingFirm("McKinsey & Company", null, firms)).toBe(true);
    expect(isConsultingFirm("Kearney", "consulting", firms)).toBe(true);
    expect(isConsultingFirm("Grab", "product-management", firms)).toBe(false);
  });
});

describe("prepEntries", () => {
  it("one per company: a pushed round first, then the rest in order, each with its kind", () => {
    const e = prepEntries(qs, apps, firms);
    expect(e.map((x) => [x.slug, x.kind])).toEqual([
      ["cognition", "round"],
      ["bcg", "consulting"],
      ["airwallex", "job"],
    ]);
    expect(e[0]).toMatchObject({ name: "Cognition", role: "Deployed Engineer", round: "Technical interview, 24 Nov" });
  });
});

describe("choosePrep", () => {
  const entries = prepEntries(qs, apps, firms);
  const owner = (id: string) => qs.find((q) => q.id === id)?.company.toLowerCase() ?? null;
  it("an explicit prep wins; old company links still land", () => {
    expect(choosePrep({ prep: "bcg" }, entries, owner)).toBe("bcg");
    expect(choosePrep({ company: "airwallex" }, entries, owner)).toBe("airwallex");
    expect(choosePrep({ prep: "nope" }, entries, owner)).toBe("cognition");
  });
  it("a linked question opens its company; a bank question or a general tab opens Practice", () => {
    expect(choosePrep({ q: "company:bcg:why" }, entries, owner)).toBe("bcg");
    expect(choosePrep({ q: "fit-about-yourself" }, entries, owner)).toBe("general");
    expect(choosePrep({ tab: "casing" }, entries, owner)).toBe("general");
  });
  it("otherwise the next real round, else Practice", () => {
    expect(choosePrep({}, entries, owner)).toBe("cognition");
    expect(choosePrep({}, entries.filter((e) => e.kind !== "round"), owner)).toBe("general");
  });
});
