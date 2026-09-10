import { describe, it, expect } from "vitest";
import { detectAts } from "./ats";

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
