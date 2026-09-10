import { describe, it, expect } from "vitest";
import {
  mapAshbyJob,
  mapGreenhouseJob,
  mapLeverPosting,
  mapSmartRecruitersPosting,
  mapBoardPayload,
} from "./mappers";

const COMPANY = "Acme Corp";

/** Shape based on Greenhouse Job Board API GET /v1/boards/{token}/jobs. */
const greenhouse = {
  id: 4012345678,
  title: "Senior Product Manager, Platform",
  absolute_url: "https://boards.greenhouse.io/acmecorp/jobs/4012345678",
  location: { name: "Singapore" },
  updated_at: "2026-09-01T10:15:00-04:00",
  content: "<p>long html we never store</p>",
};

/** Shape based on Lever Postings API GET /v0/postings/{company}?mode=json. */
const lever = {
  id: "8f1c2a3b-0000-4000-8000-000000000001",
  text: "Product Manager - Growth",
  hostedUrl: "https://jobs.lever.co/acme-labs/8f1c2a3b-0000-4000-8000-000000000001",
  categories: { location: "Singapore", team: "Product", commitment: "Full-time" },
  createdAt: 1756684800000, // 2025-09-01T00:00:00Z
};

/** Shape based on Ashby Posting API GET /posting-api/job-board/{company}. */
const ashby = {
  id: "d6a0e9c2-0000-4000-8000-000000000002",
  title: "Head of Product",
  jobUrl: "https://jobs.ashbyhq.com/AcmeRobotics/d6a0e9c2-0000-4000-8000-000000000002",
  location: "Singapore",
  publishedAt: "2026-08-30T08:00:00.000Z",
  isListed: true,
};

/** Shape based on SmartRecruiters Posting API GET /v1/companies/{company}/postings. */
const smart = {
  id: "743999912345678",
  name: "Associate Director, Strategy",
  ref: "https://api.smartrecruiters.com/v1/companies/AcmeGroup/postings/743999912345678",
  location: { city: "Singapore", country: "sg", region: "" },
  releasedDate: "2026-08-29T03:22:10.000Z",
};

describe("mapGreenhouseJob", () => {
  it("maps a Greenhouse job to a SourcedJob (company comes from the watchlist entry)", () => {
    const job = mapGreenhouseJob(greenhouse, COMPANY);
    expect(job).toMatchObject({
      source: "greenhouse",
      externalId: "4012345678",
      title: "Senior Product Manager, Platform",
      company: COMPANY,
      location: "Singapore",
      url: "https://boards.greenhouse.io/acmecorp/jobs/4012345678",
      postedAt: "2026-09-01",
      score: null,
      status: "new",
    });
    expect(job.id).toBe("greenhouse-4012345678");
  });

  it("tolerates missing optional fields", () => {
    const job = mapGreenhouseJob({ title: "PM" }, COMPANY);
    expect(job.externalId).toBeNull();
    expect(job.location).toBeNull();
    expect(job.url).toBeNull();
    expect(job.postedAt).toBeNull();
    expect(job.company).toBe(COMPANY);
  });
});

describe("mapLeverPosting", () => {
  it("maps a Lever posting, converting createdAt (ms epoch) to an ISO date", () => {
    const job = mapLeverPosting(lever, COMPANY);
    expect(job).toMatchObject({
      source: "lever",
      externalId: "8f1c2a3b-0000-4000-8000-000000000001",
      title: "Product Manager - Growth",
      company: COMPANY,
      location: "Singapore",
      url: "https://jobs.lever.co/acme-labs/8f1c2a3b-0000-4000-8000-000000000001",
      postedAt: "2025-09-01",
    });
  });

  it("tolerates missing fields", () => {
    const job = mapLeverPosting({}, COMPANY);
    expect(job.title).toBe("");
    expect(job.location).toBeNull();
    expect(job.postedAt).toBeNull();
  });
});

describe("mapAshbyJob", () => {
  it("maps an Ashby job", () => {
    expect(mapAshbyJob(ashby, COMPANY)).toMatchObject({
      source: "ashby",
      externalId: "d6a0e9c2-0000-4000-8000-000000000002",
      title: "Head of Product",
      company: COMPANY,
      location: "Singapore",
      url: "https://jobs.ashbyhq.com/AcmeRobotics/d6a0e9c2-0000-4000-8000-000000000002",
      postedAt: "2026-08-30",
    });
  });

  it("tolerates missing fields", () => {
    const job = mapAshbyJob({ id: 7 }, COMPANY);
    expect(job.externalId).toBe("7");
    expect(job.url).toBeNull();
    expect(job.postedAt).toBeNull();
  });
});

describe("mapSmartRecruitersPosting", () => {
  it("maps a SmartRecruiters posting, joining city + country into the location", () => {
    expect(mapSmartRecruitersPosting(smart, COMPANY)).toMatchObject({
      source: "smartrecruiters",
      externalId: "743999912345678",
      title: "Associate Director, Strategy",
      company: COMPANY,
      location: "Singapore, SG",
      url: "https://api.smartrecruiters.com/v1/companies/AcmeGroup/postings/743999912345678",
      postedAt: "2026-08-29",
    });
  });

  it("tolerates missing fields", () => {
    const job = mapSmartRecruitersPosting({ name: "Analyst", location: { city: "Singapore" } }, COMPANY);
    expect(job.location).toBe("Singapore");
    expect(job.url).toBeNull();
    expect(mapSmartRecruitersPosting({}, COMPANY).location).toBeNull();
  });
});

describe("mapBoardPayload", () => {
  it("unwraps each ATS's list envelope and maps every posting", () => {
    expect(mapBoardPayload("greenhouse", { jobs: [greenhouse] }, COMPANY)).toHaveLength(1);
    expect(mapBoardPayload("lever", [lever, lever], COMPANY)).toHaveLength(2);
    expect(mapBoardPayload("ashby", { jobs: [ashby] }, COMPANY)).toHaveLength(1);
    expect(mapBoardPayload("smartrecruiters", { content: [smart] }, COMPANY)).toHaveLength(1);
  });

  it("returns [] for an unknown ATS or a malformed payload rather than throwing", () => {
    expect(mapBoardPayload("unknown", { jobs: [greenhouse] }, COMPANY)).toEqual([]);
    expect(mapBoardPayload("greenhouse", null, COMPANY)).toEqual([]);
    expect(mapBoardPayload("greenhouse", { jobs: "nope" }, COMPANY)).toEqual([]);
    expect(mapBoardPayload("lever", { not: "an array" }, COMPANY)).toEqual([]);
  });
});
