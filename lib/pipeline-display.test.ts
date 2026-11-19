import { describe, it, expect } from "vitest";
import { familyLabel, monogram, toneFor, TONES } from "./pipeline-display";

describe("familyLabel", () => {
  it("turns a role-family slug into sentence case", () => {
    expect(familyLabel("product-management")).toBe("Product management");
    expect(familyLabel("consulting")).toBe("Consulting");
    expect(familyLabel("ai_ml")).toBe("Ai ml");
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
