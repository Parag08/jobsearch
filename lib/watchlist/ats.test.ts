import { describe, it, expect } from "vitest";
import { corroborateBoard, detectAts, registrableDomain } from "./ats";

describe("detectAts", () => {
  it("derives Greenhouse from boards.greenhouse.io/<token>", () => {
    expect(detectAts("https://boards.greenhouse.io/acmecorp")).toEqual({
      ats: "greenhouse",
      token: "acmecorp",
      endpoint: "https://boards-api.greenhouse.io/v1/boards/acmecorp/jobs?content=true",
    });
  });

  it("derives Greenhouse from job-boards.greenhouse.io, ignoring a deep job link", () => {
    const r = detectAts("https://job-boards.greenhouse.io/acmecorp/jobs/4012345?gh_src=abc123");
    expect(r.ats).toBe("greenhouse");
    expect(r.token).toBe("acmecorp");
  });

  it("derives Lever from jobs.lever.co/<company>, tolerating trailing slash and query", () => {
    expect(detectAts("https://jobs.lever.co/acme-labs/?lever-source=LinkedIn")).toEqual({
      ats: "lever",
      token: "acme-labs",
      endpoint: "https://api.lever.co/v0/postings/acme-labs?mode=json",
    });
  });

  it("derives Ashby from jobs.ashbyhq.com/<company>", () => {
    expect(detectAts("http://jobs.ashbyhq.com/AcmeRobotics/8d7f-deep-link")).toEqual({
      ats: "ashby",
      token: "AcmeRobotics",
      endpoint: "https://api.ashbyhq.com/posting-api/job-board/AcmeRobotics",
    });
  });

  it("derives SmartRecruiters from careers.smartrecruiters.com/<company>", () => {
    expect(detectAts("https://careers.smartrecruiters.com/AcmeGroup/")).toEqual({
      ats: "smartrecruiters",
      token: "AcmeGroup",
      endpoint: "https://api.smartrecruiters.com/v1/companies/AcmeGroup/postings",
    });
  });

  it("tolerates a missing scheme and www-style subdomain noise", () => {
    expect(detectAts("boards.greenhouse.io/acmecorp/").token).toBe("acmecorp");
    expect(detectAts("www.jobs.lever.co/acme").ats).toBe("lever");
  });

  it("returns unknown with no token/endpoint for anything else (manual fallback)", () => {
    expect(detectAts("https://www.acme.example/careers")).toEqual({
      ats: "unknown",
      token: null,
      endpoint: null,
    });
    expect(detectAts("https://boards.greenhouse.io/")).toEqual({ ats: "unknown", token: null, endpoint: null });
    expect(detectAts("not a url at all")).toEqual({ ats: "unknown", token: null, endpoint: null });
    expect(detectAts("")).toEqual({ ats: "unknown", token: null, endpoint: null });
  });

  it("does not match look-alike hosts (no substring matching on the hostname)", () => {
    expect(detectAts("https://boards.greenhouse.io.evil.example/acme").ats).toBe("unknown");
    expect(detectAts("https://notjobs.lever.co/acme").ats).toBe("unknown");
  });
});

// ---- board ownership -------------------------------------------------------------
// Fixtures are the real false positives from the 2026-09-23 probe run. Each of these
// tokens returned real, current jobs; only corroboration told them apart.

describe("registrableDomain", () => {
  it("keeps multi-part public suffixes like gov.sg intact", () => {
    expect(registrableDomain("https://www.tech.gov.sg/careers/")).toBe("tech.gov.sg");
    expect(registrableDomain("https://jobs.careers.gov.sg/jobs/1")).toBe("careers.gov.sg");
  });

  it("reduces an ordinary host to its registrable domain", () => {
    expect(registrableDomain("https://www.thunes.com/careers/")).toBe("thunes.com");
  });

  it("returns null for junk rather than throwing", () => {
    expect(registrableDomain("not a url")).toBeNull();
  });
});

describe("corroborateBoard", () => {
  it("accepts when the board names the same employer", () => {
    expect(
      corroborateBoard("Grab", "https://grab.careers/", "grab", { boardName: "Grab" }),
    ).toBe("board-name");
  });

  it("accepts when the employer's own domain appears in its job links", () => {
    expect(
      corroborateBoard("Thunes", "https://www.thunes.com/careers/", "thunes", {
        jobUrl: "https://www.thunes.com/careers/apply/123",
      }),
    ).toBe("employer-domain");
  });

  it("accepts a long unambiguous token that matches the name", () => {
    expect(
      corroborateBoard("GovTech Singapore", "https://www.tech.gov.sg/careers/", "govtech", {
        jobUrl: "https://jobs.careers.gov.sg/jobs/greenhouse/4004028201",
      }),
    ).toBe("token-name");
  });

  it("REJECTS mas - an Illinois HVAC firm, not the Monetary Authority of Singapore", () => {
    expect(
      corroborateBoard("MAS", "https://www.mas.gov.sg/careers", "mas", {
        jobUrl: "https://job-boards.greenhouse.io/mas/jobs/5419878008",
      }),
    ).toBeNull();
  });

  it("REJECTS edb - EnterpriseDB, not Singapore's Economic Development Board", () => {
    expect(
      corroborateBoard("EDB Singapore", "https://www.edb.gov.sg/en/careers.html", "edb", {
        jobUrl: "https://www.enterprisedb.com/careers/job-openings?gh_jid=771",
      }),
    ).toBeNull();
  });

  it("REJECTS sia - a fragment match is how Sia Partners passes for SIA Engineering", () => {
    // "sia" is contained in "siaengineering", so a containment test alone accepts it.
    // The length ratio is what refuses: 3 characters against 14.
    expect(
      corroborateBoard("SIA Engineering", "https://www.siaec.com.sg/careers", "sia", {
        boardName: "Sia",
      }),
    ).toBeNull();
  });

  it("REJECTS bcg - a three-letter token with no external signal, and a test board at that", () => {
    expect(
      corroborateBoard("BCG", "https://careers.bcg.com/", "bcg", {
        jobUrl: "https://job-boards.greenhouse.io/bcg/jobs/4715850005",
      }),
    ).toBeNull();
  });

  it("documents the cost of strictness: lever/nium is really Nium and is still refused", () => {
    // Its postings name Instarem, Nium's subsidiary, but nothing in the payload proves
    // the link. This false negative is why `confirmed: true` exists in the seed file.
    expect(
      corroborateBoard("Nium", "https://www.nium.com/careers", "nium", {
        jobUrl: "https://jobs.lever.co/nium/9170b2b6",
      }),
    ).toBeNull();
  });

  it("accepts a comparable-length board name even when it is not identical", () => {
    expect(
      corroborateBoard("ByteDance / TikTok", "https://careers.tiktok.com/", "bytedance", {
        boardName: "bytedance",
      }),
    ).toBe("board-name");
  });

  it("refuses when there is no signal at all", () => {
    expect(corroborateBoard("Acme", "https://acme.example/careers", "xyz", {})).toBeNull();
  });
});
