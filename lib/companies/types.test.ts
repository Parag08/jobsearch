import { describe, it, expect } from "vitest";
import { CompanySchema, companyFromSeed, COMPANY_SEED_PATH } from "./types";

const seed = {
  company: "Grab",
  type: "regional-platform",
  careersUrl: "https://grab.careers/",
  ats: "smartrecruiters",
  token: "grab",
  probed: "2026-09-23",
};

describe("company directory types", () => {
  it("maps a seed entry into a company, carrying the VERIFIED ats and token", () => {
    const c = companyFromSeed(seed);
    expect(c).toEqual({
      name: "Grab",
      type: "regional-platform",
      careersUrl: "https://grab.careers/",
      ats: "smartrecruiters",
      token: "grab",
      confirmed: false,
      probedAt: "2026-09-23",
    });
  });

  it("does not re-derive the ats from the URL - probing verified it, the URL cannot", () => {
    // grab.careers is not an ATS host, so detectAts would say "unknown" and throw
    // away a board that probing proved exists.
    const c = companyFromSeed(seed);
    expect(c.ats).toBe("smartrecruiters");
    expect(c.token).toBe("grab");
  });

  it("defaults an unprobed or unknown entry safely", () => {
    const c = companyFromSeed({ company: "DBS Bank", type: "bank", careersUrl: "https://www.dbs.com/careers" });
    expect(c).toMatchObject({ ats: "unknown", token: null, probedAt: null, confirmed: false });
  });

  it("carries the human confirmation flag through", () => {
    expect(companyFromSeed({ ...seed, confirmed: true }).confirmed).toBe(true);
  });

  it("treats `type` as data, never a code enum (rule 4)", () => {
    // A new category must be addable in the JSON without touching lib/.
    const c = companyFromSeed({ ...seed, type: "space-elevator-operator" });
    expect(CompanySchema.omit({ id: true }).safeParse(c).success).toBe(true);
  });

  it("rejects a company with no name", () => {
    expect(() => companyFromSeed({ company: "", type: "bank", careersUrl: "https://x.com" })).toThrow();
  });

  it("names the seed file in one place, so nothing hardcodes the path", () => {
    expect(COMPANY_SEED_PATH).toBe("data/singapore/companies.json");
  });
});
