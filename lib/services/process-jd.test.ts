import { describe, it, expect } from "vitest";
import { FakeLlm } from "../adapters/llm";
import type { JdExtract } from "../types";
import { FakeDb } from "../repos/fake-db";
import { listApplications } from "../repos/applications";
import { listSectors } from "../repos/sectors";
import { processJd } from "./process-jd";

const jd: JdExtract = {
  company: "Grab",
  role: "Senior PM, AI",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["roadmap", "llm evals"],
  keywords: ["genai"],
  seniority: "senior",
  visaNote: "EP sponsorship stated",
  location: "Singapore",
};

const NOW = "2026-08-29T10:00:00Z";

function fixtures() {
  const db = new FakeDb();
  const llm = new FakeLlm();
  llm.stubJdExtract(jd);
  return { db, llm };
}

describe("processJd", () => {
  it("extracts once, merges the sector, and creates a saved application", async () => {
    const { db, llm } = fixtures();
    const { application, sector } = await processJd({ db, llm }, "u1", "raw JD text", NOW);

    expect(llm.calls).toHaveLength(1); // parse ONCE (token rule #1)
    expect(sector.jdCount).toBe(1);
    expect(sector.skills["roadmap"]).toBe(1);
    expect(application.stage).toBe("saved");
    expect(application.company).toBe("Grab");
    expect(application.sectorId).toBe(sector.id);
    expect(application.jdExtract).toEqual(jd);
    expect(application.savedAt).toBe("2026-08-29");
    expect(db.rows("applications")[0]?.jd_raw).toBe("raw JD text"); // audit copy, DB only
  });

  it("second JD in the same sector merges into the existing node", async () => {
    const { db, llm } = fixtures();
    await processJd({ db, llm }, "u1", "raw JD 1", NOW);
    const { sector } = await processJd({ db, llm }, "u1", "raw JD 2", NOW);

    expect(sector.jdCount).toBe(2);
    expect(sector.skills["roadmap"]).toBe(2);
    expect(await listSectors(db, "u1")).toHaveLength(1);
    expect(await listApplications(db, "u1")).toHaveLength(2);
  });
});
