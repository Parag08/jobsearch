import { describe, it, expect } from "vitest";
import { FakeLlm, routeModel } from "./llm";

describe("routeModel", () => {
  it("routes extraction and classification to the small tier", () => {
    expect(routeModel("extract-jd").tier).toBe("small");
    expect(routeModel("classify-sector").tier).toBe("small");
    expect(routeModel("summarize-node").tier).toBe("small");
  });
  it("routes visible-quality writing to the premium tier", () => {
    expect(routeModel("polish-cv").tier).toBe("premium");
    expect(routeModel("draft-outreach").tier).toBe("premium");
  });
});

describe("FakeLlm", () => {
  it("returns a valid JdExtract and records the call for token accounting", async () => {
    const llm = new FakeLlm();
    llm.stubJdExtract({
      company: "Grab",
      role: "PM",
      roleFamily: "product-management",
      sectorPath: ["IT", "AI", "Singapore"],
      skills: ["sql"],
      keywords: [],
      seniority: null,
      visaNote: null,
      location: "Singapore",
    });
    const out = await llm.extractJd("...raw jd text...");
    expect(out.company).toBe("Grab");
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].task).toBe("extract-jd");
  });
});
