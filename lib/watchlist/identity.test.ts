import { describe, it, expect } from "vitest";
import type { Application, SourcedJob } from "../types";
import { canonicalJobUrl, dedupeJobs, excludeAlreadyInPipeline, jobIdentity } from "./identity";

function job(over: Partial<SourcedJob> = {}): SourcedJob {
  return {
    id: "j",
    source: "greenhouse",
    externalId: "1",
    title: "Senior Product Manager",
    company: "Acme Corp",
    location: "Singapore",
    url: null,
    postedAt: null,
    score: null,
    status: "new",
    ...over,
  };
}

function app(over: Partial<Application> = {}): Application {
  return {
    id: "a",
    company: "Acme Corp",
    role: "Senior Product Manager",
    sectorId: null,
    stage: "applied",
    closedReason: null,
    jdExtract: null,
    cvVersionId: null,
    referralContactId: null,
    nextAction: null,
    savedAt: "2026-08-01",
    appliedAt: "2026-08-02",
    updatedAt: "2026-08-02T00:00:00Z",
    ...over,
  };
}

describe("canonicalJobUrl", () => {
  it("lowercases the host, strips tracking params, trailing slash and fragment", () => {
    expect(
      canonicalJobUrl(
        "https://Boards.Greenhouse.io/acmecorp/jobs/4012345678/?gh_src=abc&utm_source=li&utm_medium=x&ref=home#app",
      ),
    ).toBe("https://boards.greenhouse.io/acmecorp/jobs/4012345678");
    expect(canonicalJobUrl("https://jobs.lever.co/acme/8f1c?lever-source=LinkedIn&source=x")).toBe(
      "https://jobs.lever.co/acme/8f1c",
    );
  });

  it("keeps meaningful query params, sorted for stability", () => {
    expect(canonicalJobUrl("https://x.example/j?b=2&a=1&utm_campaign=z")).toBe("https://x.example/j?a=1&b=2");
  });

  it("does not touch the path's case and returns a trimmed string for unparseable input", () => {
    expect(canonicalJobUrl("https://x.example/Jobs/ABC")).toBe("https://x.example/Jobs/ABC");
    expect(canonicalJobUrl("  not a url  ")).toBe("not a url");
  });
});

describe("jobIdentity", () => {
  it("uses the canonical URL when present", () => {
    const a = jobIdentity(job({ url: "https://x.example/j/1?utm_source=a" }));
    const b = jobIdentity(job({ url: "https://X.example/j/1/" , source: "adzuna", title: "different" }));
    expect(a).toBe(b);
  });

  it("falls back to norm(company)|norm(title)|norm(location) without a URL", () => {
    expect(jobIdentity(job({ title: "  Senior   Product Manager " }))).toBe(
      "acme corp|senior product manager|singapore",
    );
    expect(jobIdentity(job({ location: null }))).toBe("acme corp|senior product manager|");
  });
});

describe("dedupeJobs", () => {
  it("keeps the first seen per identity across sources", () => {
    const gh = job({ source: "greenhouse", url: "https://x.example/j/1?gh_src=a" });
    const adz = job({ source: "adzuna", externalId: "999", url: "https://x.example/j/1/" });
    const other = job({ source: "adzuna", externalId: "2", url: "https://x.example/j/2" });
    const out = dedupeJobs([gh, adz, other]);
    expect(out).toEqual([gh, other]);
  });

  it("dedupes URL-less jobs on company + title + location", () => {
    const a = job({ source: "lever" });
    const b = job({ source: "adzuna", title: "senior product manager", company: "ACME CORP" });
    const c = job({ source: "adzuna", location: "London" });
    expect(dedupeJobs([a, b, c])).toEqual([a, c]);
  });
});

describe("excludeAlreadyInPipeline", () => {
  it("drops jobs whose company + title match an application at any stage", () => {
    const applied = job();
    const closed = job({ title: "Head of Product" });
    const fresh = job({ title: "Staff PM" });
    const apps = [app(), app({ role: "head of product", stage: "closed", closedReason: "lost" })];
    expect(excludeAlreadyInPipeline([applied, closed, fresh], apps)).toEqual([fresh]);
  });

  it("does not drop the same title at a different company", () => {
    const elsewhere = job({ company: "Other Co" });
    expect(excludeAlreadyInPipeline([elsewhere], [app()])).toEqual([elsewhere]);
  });
});
