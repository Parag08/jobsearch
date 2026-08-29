import { describe, it, expect } from "vitest";
import { mapAdzunaResult } from "./adzuna";

/** Shape based on Adzuna API v1 /jobs/{country}/search responses. */
const fixture = {
  id: "5012345678",
  title: "Senior Product Manager - AI Platform",
  company: { display_name: "Grab" },
  location: { display_name: "Singapore" },
  redirect_url: "https://www.adzuna.sg/details/5012345678",
  created: "2026-08-28T02:11:00Z",
};

describe("mapAdzunaResult", () => {
  it("maps an Adzuna result to a SourcedJob", () => {
    const job = mapAdzunaResult(fixture);
    expect(job).toMatchObject({
      source: "adzuna",
      externalId: "5012345678",
      title: "Senior Product Manager - AI Platform",
      company: "Grab",
      location: "Singapore",
      url: "https://www.adzuna.sg/details/5012345678",
      status: "new",
    });
    expect(job.postedAt).toBe("2026-08-28");
  });

  it("tolerates missing optional fields", () => {
    const job = mapAdzunaResult({ id: 99, title: "PM" });
    expect(job.company).toBe("");
    expect(job.location).toBeNull();
    expect(job.url).toBeNull();
    expect(job.postedAt).toBeNull();
  });
});
