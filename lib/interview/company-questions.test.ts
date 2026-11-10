import { describe, expect, it } from "vitest";
import type { Application } from "../types";
import {
  COMPANY_GROUP,
  companyQuestions,
  companySlug,
  isCompanyQuestionId,
  parseCompanyTemplates,
  type CompanyTemplate,
} from "./company-questions";

const templates: CompanyTemplate[] = [
  { id: "why", competency: "motivation", text: "Why {company}?", lookFor: "A researched reason {company} fits you." },
  { id: "role", competency: "motivation", text: "Why the {role} role at {company}?", lookFor: "Tie what {role} needs to your record.", short: "Why this role?" },
];

function app(over: Partial<Application>): Application {
  return {
    id: "a1",
    company: "Grab",
    role: "Senior Product Manager",
    sectorId: null,
    stage: "applied",
    closedReason: null,
    jdExtract: null,
    cvVersionId: null,
    referralContactId: null,
    nextAction: null,
    savedAt: "2026-11-01",
    appliedAt: null,
    updatedAt: "2026-11-01T00:00:00Z",
    ...over,
  };
}

describe("companySlug", () => {
  it("is lowercase, hyphenated and stable", () => {
    expect(companySlug("  Boston Consulting   Group ")).toBe("boston-consulting-group");
    expect(companySlug("AT&T / Asia")).toBe("at-t-asia");
  });
});

describe("companyQuestions", () => {
  it("asks each template once per company, with names filled in", () => {
    const qs = companyQuestions([app({})], templates);
    expect(qs.map((q) => [q.id, q.text])).toEqual([
      ["company:grab:why", "Why Grab?"],
      ["company:grab:role", "Why the Senior Product Manager role at Grab?"],
    ]);
    expect(qs[0]).toMatchObject({ group: COMPANY_GROUP.id, competency: "motivation", firms: [], company: "Grab" });
    expect(qs[0].lookFor).toBe("A researched reason Grab fits you.");
    // The short list label falls back to the full text when a template has none.
    expect(qs.map((q) => q.short)).toEqual(["Why Grab?", "Why this role?"]);
  });

  it("merges applications to the same company and uses the most recent role", () => {
    const qs = companyQuestions(
      [
        app({ id: "old", role: "Product Manager", updatedAt: "2026-10-01T00:00:00Z" }),
        app({ id: "new", company: "grab", role: "Group Product Manager", updatedAt: "2026-11-05T00:00:00Z" }),
      ],
      templates,
    );
    expect(qs).toHaveLength(2);
    expect(qs[1].text).toBe("Why the Group Product Manager role at grab?");
  });

  it("leaves out closed applications", () => {
    expect(companyQuestions([app({ closedReason: "lost" })], templates)).toEqual([]);
  });

  it("orders companies by most recent activity", () => {
    const qs = companyQuestions(
      [app({ id: "1", company: "Grab", updatedAt: "2026-10-01T00:00:00Z" }), app({ id: "2", company: "Shopee", updatedAt: "2026-11-01T00:00:00Z" })],
      templates,
    );
    expect(qs.map((q) => q.company)).toEqual(["Shopee", "Shopee", "Grab", "Grab"]);
  });

  it("skips a template that needs a role when there is none", () => {
    const qs = companyQuestions([app({ role: "  " })], templates);
    expect(qs.map((q) => q.id)).toEqual(["company:grab:why"]);
  });

  it("carries the job description's facts as context - never invented", () => {
    const qs = companyQuestions(
      [
        app({
          jdExtract: {
            company: "Grab",
            role: "Senior Product Manager",
            roleFamily: "pm",
            sectorPath: ["Tech", "Mobility"],
            skills: ["experimentation", "pricing", "sql", "stakeholder management", "roadmaps", "ml", "extra"],
            keywords: [],
            seniority: null,
            visaNote: null,
            location: "Singapore",
          },
        }),
      ],
      templates,
    );
    expect(qs[0].context).toBe(
      "Role applied for: Senior Product Manager. The job asks for: experimentation, pricing, sql, stakeholder management, roadmaps, ml. Sector: Tech > Mobility. Location: Singapore.",
    );
    expect(companyQuestions([app({})], templates)[0].context).toBe("Role applied for: Senior Product Manager.");
  });

  it("returns nothing with no applications", () => {
    expect(companyQuestions([], templates)).toEqual([]);
  });
});

describe("isCompanyQuestionId", () => {
  it("tells company questions from bank questions", () => {
    expect(isCompanyQuestionId("company:grab:why")).toBe(true);
    expect(isCompanyQuestionId("fit-cv-walk")).toBe(false);
  });
});

describe("parseCompanyTemplates", () => {
  it("validates the templates in the data file", () => {
    expect(parseCompanyTemplates(templates)).toEqual(templates);
    expect(() => parseCompanyTemplates([{ id: "x", text: "No placeholder", competency: "m", lookFor: "l" }])).toThrow(/company/);
    expect(() => parseCompanyTemplates([...templates, templates[0]])).toThrow(/duplicate/);
  });
});
