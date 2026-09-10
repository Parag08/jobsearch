import { describe, it, expect } from "vitest";
import {
  buildJdExtractPrompt,
  buildSummarizePrompt,
  parseJsonLoose,
  validateJdExtract,
  LlmHttpError,
  readBodyOrThrow,
  SUMMARY_MAX_TOKENS,
} from "./llm-http";

const validJd = {
  company: "Grab",
  role: "Senior PM, AI",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["roadmap"],
  keywords: ["genai"],
  seniority: "senior",
  visaNote: null,
  location: "Singapore",
};

describe("buildJdExtractPrompt", () => {
  it("embeds the raw JD and names every JdExtract field with its type", () => {
    const p = buildJdExtractPrompt("We are hiring a PM at Grab.");
    expect(p).toContain("We are hiring a PM at Grab.");
    for (const f of ["company", "role", "roleFamily", "sectorPath", "skills", "keywords", "seniority", "visaNote", "location"]) {
      expect(p).toContain(`"${f}"`);
    }
    expect(p).toMatch(/string\s*\|\s*null/); // nullable fields typed explicitly
    expect(p).toMatch(/industry\s*>\s*sub-domain\s*>\s*geography/i);
    expect(p).toMatch(/JSON/); // Groq json_object mode requires the word JSON in the prompt
    expect(p).toMatch(/no prose/i);
  });
});

describe("buildSummarizePrompt", () => {
  it("asks for plain text within the token cap and embeds the node JSON", () => {
    const p = buildSummarizePrompt('{"id":"it-ai-singapore"}');
    expect(p).toContain('{"id":"it-ai-singapore"}');
    expect(p).toContain(String(SUMMARY_MAX_TOKENS));
    expect(p).toMatch(/plain text/i);
    expect(SUMMARY_MAX_TOKENS).toBeLessThanOrEqual(150);
  });
});

describe("parseJsonLoose", () => {
  it("parses clean JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ```json fences", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("strips bare ``` fences", () => {
    expect(parseJsonLoose("```\n[1,2]\n```")).toEqual([1, 2]);
  });
  it("tolerates leading and trailing prose around an object", () => {
    expect(parseJsonLoose('Sure! Here is the JSON:\n{"a":{"b":[1,2]}}\nHope that helps.')).toEqual({ a: { b: [1, 2] } });
  });
  it("tolerates leading and trailing prose around an array", () => {
    expect(parseJsonLoose("Result: [1, 2, 3]. Done.")).toEqual([1, 2, 3]);
  });
  it("throws a clear error when no JSON is present", () => {
    expect(() => parseJsonLoose("no json here")).toThrow(/no JSON/i);
  });
  it("throws a clear error on truncated JSON", () => {
    expect(() => parseJsonLoose('{"a": [1, 2')).toThrow(/invalid JSON/i);
  });
  it("throws on empty input", () => {
    expect(() => parseJsonLoose("   ")).toThrow(/no JSON/i);
  });
});

describe("validateJdExtract", () => {
  it("returns a typed JdExtract for valid input", () => {
    expect(validateJdExtract(validJd)).toEqual(validJd);
  });
  it("names the failing field in the error", () => {
    expect(() => validateJdExtract({ ...validJd, sectorPath: [] })).toThrow(/sectorPath/);
    expect(() => validateJdExtract({ ...validJd, company: 42 })).toThrow(/company/);
  });
  it("rejects a missing nullable field (model must emit null, not omit)", () => {
    const { visaNote: _omit, ...rest } = validJd;
    void _omit;
    expect(() => validateJdExtract(rest)).toThrow(/visaNote/);
  });
  it("rejects non-object json", () => {
    expect(() => validateJdExtract([1])).toThrow(/JdExtract/);
  });
});

describe("readBodyOrThrow", () => {
  it("returns parsed JSON on 2xx", async () => {
    const res = new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    await expect(readBodyOrThrow(res, "gemini")).resolves.toEqual({ ok: 1 });
  });
  it("throws LlmHttpError carrying status, provider and body on non-2xx", async () => {
    const res = new Response('{"error":"quota"}', { status: 429 });
    const err = await readBodyOrThrow(res, "groq").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHttpError);
    const e = err as LlmHttpError;
    expect(e.status).toBe(429);
    expect(e.provider).toBe("groq");
    expect(e.body).toContain("quota");
    expect(e.message).toMatch(/groq/);
    expect(e.message).toMatch(/429/);
  });
  it("throws a clear error when a 2xx body is not JSON", async () => {
    const res = new Response("<html>oops</html>", { status: 200 });
    await expect(readBodyOrThrow(res, "anthropic")).rejects.toThrow(/anthropic.*not valid JSON/i);
  });
});
