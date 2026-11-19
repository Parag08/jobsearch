import { describe, it, expect } from "vitest";
import { familyLabel, monogram, shortDate, toneFor, TONES } from "./pipeline-display";

describe("familyLabel", () => {
  it("turns a role-family slug into sentence case", () => {
    expect(familyLabel("product-management")).toBe("Product management");
    expect(familyLabel("consulting")).toBe("Consulting");
    expect(familyLabel("ai_ml")).toBe("AI ML");
  });
  it("keeps acronyms upper-case wherever they fall", () => {
    expect(familyLabel("mba")).toBe("MBA");
    expect(familyLabel("metrics-kpi")).toBe("Metrics KPI");
    expect(familyLabel("b2b-saas")).toBe("B2B SaaS");
    expect(familyLabel("cloud-infra")).toBe("Cloud infra");
    expect(familyLabel("api-design")).toBe("API design");
  });
});

describe("monogram", () => {
  it("keeps a short all-caps acronym", () => {
    expect(monogram("BCG (Boston Consulting Group)")).toBe("BCG");
    expect(monogram("IBM")).toBe("IBM");
  });
  it("takes the initials of the first two words, skipping joiners", () => {
    expect(monogram("Bain & Company")).toBe("BC");
    expect(monogram("Boston Consulting Group")).toBe("BC");
  });
  it("one word gives one letter, upper-cased", () => {
    expect(monogram("Microsoft")).toBe("M");
    expect(monogram("tiktok")).toBe("T");
  });
  it("never returns an empty badge", () => {
    expect(monogram("  ")).toBe("?");
  });
});

describe("toneFor", () => {
  it("is stable for the same key and always one of the tones", () => {
    expect(toneFor("consulting")).toBe(toneFor("consulting"));
    for (const k of ["consulting", "product-management", "Bain & Company", ""]) expect(TONES).toContain(toneFor(k));
  });
  it("spreads different keys across tones", () => {
    const seen = new Set(["consulting", "product-management", "engineering", "strategy", "data", "operations"].map(toneFor));
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe("shortDate", () => {
  it("is day and month in the current year", () => {
    expect(shortDate("2026-09-07", "2026-11-19")).toBe("7 Sep");
    expect(shortDate("2026-11-19T10:00:00Z", "2026-11-19")).toBe("19 Nov");
  });
  it("adds the year when it isn't this one", () => {
    expect(shortDate("2025-12-30", "2026-11-19")).toBe("30 Dec 2025");
  });
});
