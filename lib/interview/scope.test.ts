import { describe, it, expect } from "vitest";
import { behaviouralView, type ScopedQuestion } from "./scope";

const q = (id: string, group: string, company?: string): ScopedQuestion => ({ id, group, company });
const generic = [q("fit-about", "fit"), q("fit-strengths", "fit"), q("team-led", "team")];
const company = [
  q("company:kpmg:why", "company", "KPMG"),
  q("company:kpmg:role", "company", "KPMG"),
  q("company:grab-holdings:why", "company", "Grab Holdings"),
];
const custom = [q("custom:1", "custom")];
const all = { generic, company, custom };
const none = new Set<string>();

describe("behaviouralView", () => {
  it("opens on the generic bank with its first question, never a company question", () => {
    const v = behaviouralView(all, {}, none);
    expect(v.scope).toEqual({ kind: "general" });
    expect(v.questions.map((x) => x.id)).toEqual(["fit-about", "fit-strengths", "team-led"]);
    expect(v.selectedId).toBe("fit-about");
  });

  it("lists one company per live application, in pipeline order", () => {
    expect(behaviouralView(all, {}, none).companies).toEqual([
      { slug: "kpmg", name: "KPMG" },
      { slug: "grab-holdings", name: "Grab Holdings" },
    ]);
  });

  it("opens on the first question not yet practised", () => {
    expect(behaviouralView(all, {}, new Set(["fit-about"])).selectedId).toBe("fit-strengths");
  });

  it("falls back to the first question when everything is practised", () => {
    expect(behaviouralView(all, {}, new Set(generic.map((x) => x.id))).selectedId).toBe("fit-about");
  });

  it("shows only the chosen company's questions", () => {
    const v = behaviouralView(all, { company: "kpmg" }, none);
    expect(v.scope).toEqual({ kind: "company", slug: "kpmg" });
    expect(v.questions.map((x) => x.id)).toEqual(["company:kpmg:why", "company:kpmg:role"]);
    expect(v.selectedId).toBe("company:kpmg:why");
  });

  it("goes back to the generic bank for a company that is no longer in the pipeline", () => {
    expect(behaviouralView(all, { company: "enron" }, none).scope).toEqual({ kind: "general" });
  });

  it("shows your own questions on their own", () => {
    const v = behaviouralView(all, { scope: "mine" }, none);
    expect(v.scope).toEqual({ kind: "mine" });
    expect(v.questions.map((x) => x.id)).toEqual(["custom:1"]);
    expect(v.selectedId).toBe("custom:1");
  });

  it("has nothing selected when you have no questions of your own yet", () => {
    const v = behaviouralView({ ...all, custom: [] }, { scope: "mine" }, none);
    expect(v.questions).toEqual([]);
    expect(v.selectedId).toBeNull();
  });

  it("a linked question decides the view, so old links keep working", () => {
    expect(behaviouralView(all, { q: "company:grab-holdings:why" }, none)).toMatchObject({
      scope: { kind: "company", slug: "grab-holdings" },
      selectedId: "company:grab-holdings:why",
    });
    expect(behaviouralView(all, { q: "custom:1", company: "kpmg" }, none)).toMatchObject({
      scope: { kind: "mine" },
      selectedId: "custom:1",
    });
    expect(behaviouralView(all, { q: "team-led", scope: "mine" }, none)).toMatchObject({
      scope: { kind: "general" },
      selectedId: "team-led",
    });
  });

  it("ignores a linked question that does not exist", () => {
    expect(behaviouralView(all, { q: "gone", company: "kpmg" }, none)).toMatchObject({
      scope: { kind: "company", slug: "kpmg" },
      selectedId: "company:kpmg:why",
    });
  });
});
