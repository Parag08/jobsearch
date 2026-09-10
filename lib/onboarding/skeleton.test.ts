import { describe, it, expect } from "vitest";
import { SkeletonSchema, mergeSkeletons, datesOverlap, type Skeleton } from "./skeleton";

const linkedin: Skeleton = {
  orgs: [
    {
      name: "Nutanix Inc.",
      roles: [
        { title: "Senior Product Manager", start: "2021-03", end: "2023-08", location: "Bangalore" },
        { title: "Product Manager", start: "2019-06", end: "2021-03" },
      ],
    },
    { name: "Valeo", roles: [{ title: "Intern", start: "2018-05", end: "2018-08" }] },
  ],
};

const cv: Skeleton = {
  orgs: [
    {
      name: "Nutanix",
      roles: [
        {
          title: "Lead Product Manager", // upgraded in the retelling
          start: "2021", // rounded to a year
          end: "2023",
          blurb: "Owned the security posture product line; cut 400+ critical risks to 20.",
        },
        { title: "Product Manager", start: "2019-06", end: "2021-03", blurb: "Shipped the partner portal." },
      ],
    },
    { name: "EverHaus", roles: [{ title: "Advisor", start: "2024-01", end: null, blurb: "Part-time GTM advice." }] },
  ],
};

describe("SkeletonSchema", () => {
  it("accepts an org -> roles timeline with optional location and blurb, nullable end", () => {
    expect(SkeletonSchema.parse(cv)).toEqual(cv);
    expect(() => SkeletonSchema.parse({ orgs: [{ name: "X", roles: [{ title: "T", start: "2020" }] }] })).toThrow();
  });
});

describe("datesOverlap", () => {
  it("treats a year as the whole year and null end as ongoing", () => {
    expect(datesOverlap({ start: "2021", end: "2023" }, { start: "2021-03", end: "2023-08" })).toBe(true);
    expect(datesOverlap({ start: "2019-06", end: "2021-03" }, { start: "2021-04", end: null })).toBe(false);
    expect(datesOverlap({ start: "2024-01", end: null }, { start: "2026-05", end: "2026-06" })).toBe(true);
  });
});

describe("mergeSkeletons", () => {
  it("returns the only source untouched when the other is null", () => {
    expect(mergeSkeletons(linkedin, null)).toEqual({ merged: linkedin, disagreements: [] });
    expect(mergeSkeletons(null, cv)).toEqual({ merged: cv, disagreements: [] });
    expect(mergeSkeletons(null, null)).toEqual({ merged: { orgs: [] }, disagreements: [] });
  });

  const { merged, disagreements } = mergeSkeletons(linkedin, cv);
  const nutanix = merged.orgs[0];

  it("LinkedIn wins on skeleton facts: org name, official title, exact dates", () => {
    expect(nutanix.name).toBe("Nutanix Inc.");
    expect(nutanix.roles[0].title).toBe("Senior Product Manager");
    expect(nutanix.roles[0].start).toBe("2021-03");
    expect(nutanix.roles[0].end).toBe("2023-08");
    expect(nutanix.roles[0].location).toBe("Bangalore");
  });

  it("the CV wins on blurb content", () => {
    expect(nutanix.roles[0].blurb).toBe("Owned the security posture product line; cut 400+ critical risks to 20.");
    expect(nutanix.roles[1].blurb).toBe("Shipped the partner portal.");
  });

  it("surfaces a title upgraded in the retelling and a date rounded to a year - never silently resolved", () => {
    expect(disagreements).toContainEqual({
      org: "Nutanix Inc.", role: "Senior Product Manager", field: "title",
      linkedin: "Senior Product Manager", cv: "Lead Product Manager",
    });
    expect(disagreements).toContainEqual({
      org: "Nutanix Inc.", role: "Senior Product Manager", field: "start", linkedin: "2021-03", cv: "2021",
    });
    expect(disagreements).toContainEqual({
      org: "Nutanix Inc.", role: "Senior Product Manager", field: "end", linkedin: "2023-08", cv: "2023",
    });
  });

  it("surfaces the org-name difference once, at org level", () => {
    expect(disagreements).toContainEqual({
      org: "Nutanix Inc.", role: null, field: "org", linkedin: "Nutanix Inc.", cv: "Nutanix",
    });
  });

  it("does not report agreement as disagreement", () => {
    const pm = disagreements.filter((d) => d.role === "Product Manager");
    expect(pm).toEqual([]);
  });

  it("keeps roles and orgs only one source knows about, LinkedIn order first", () => {
    expect(merged.orgs.map((o) => o.name)).toEqual(["Nutanix Inc.", "Valeo", "EverHaus"]);
    expect(merged.orgs[2].roles[0].end).toBeNull();
  });

  it("matches roles by fuzzy title when dates do not overlap", () => {
    const li: Skeleton = { orgs: [{ name: "Acme", roles: [{ title: "Head of Product", start: "2020-01", end: "2022-01" }] }] };
    // CV dates are wrong by two years - no overlap at all - but the title is the same role
    const c: Skeleton = { orgs: [{ name: "ACME", roles: [{ title: "head of product", start: "2018", end: "2019", blurb: "b" }] }] };
    const r = mergeSkeletons(li, c);
    expect(r.merged.orgs[0].roles).toHaveLength(1);
    expect(r.merged.orgs[0].roles[0].blurb).toBe("b");
    expect(r.disagreements.map((d) => d.field).sort()).toEqual(["end", "start"]);
  });

  it("matches orgs after stripping legal suffixes and case", () => {
    const li: Skeleton = { orgs: [{ name: "Grab Holdings Ltd", roles: [{ title: "PM", start: "2020", end: null }] }] };
    const c: Skeleton = { orgs: [{ name: "grab holdings", roles: [{ title: "PM", start: "2020", end: null }] }] };
    const r = mergeSkeletons(li, c);
    expect(r.merged.orgs).toHaveLength(1);
    expect(r.disagreements).toEqual([
      { org: "Grab Holdings Ltd", role: null, field: "org", linkedin: "Grab Holdings Ltd", cv: "grab holdings" },
    ]);
  });

  it("is pure: inputs are not mutated", () => {
    const liCopy = JSON.parse(JSON.stringify(linkedin));
    const cvCopy = JSON.parse(JSON.stringify(cv));
    mergeSkeletons(linkedin, cv);
    expect(linkedin).toEqual(liCopy);
    expect(cv).toEqual(cvCopy);
  });
});
