import { describe, it, expect } from "vitest";
import shipped from "../../data/interview/cases.json";
import { casesFor, parseCaseLibrary, type CaseSheet } from "./case-sheet";

/** The smallest valid case: structure first, recommendation last, math with an answer, chart with an exhibit. */
function sheet(over: Partial<CaseSheet> = {}): CaseSheet {
  return {
    id: "c1",
    title: "Acme buys Beta",
    firm: "bain",
    style: "candidate-led",
    caseType: "m-and-a",
    sector: "it-services",
    level: "medium",
    minutes: 30,
    prompt: "Acme is thinking about buying Beta. Should it?",
    facts: [{ id: "goal", ask: ["goal", "objective"], text: "Grow 8% a year." }],
    questions: [
      { id: "q1", kind: "structure", ask: "How would you approach this?", keyPoints: ["market", "target", "synergies", "price"] },
      {
        id: "q2",
        kind: "math",
        ask: "What is the most Acme should pay?",
        given: ["Beta EBITDA is US$20m."],
        onRequest: ["Peers trade at 18x EBITDA."],
        answer: { value: 360e6, display: "US$360m", tolerance: 0.02, working: ["20m x 18 = 360m"] },
      },
      {
        id: "q3",
        kind: "chart",
        ask: "What do you take from this?",
        exhibit: { title: "Revenue", columns: ["Year", "Revenue"], rows: [["2024", 100], ["2025", 90]] },
        keyPoints: ["revenue is falling"],
      },
      { id: "q4", kind: "brainstorm", ask: "What are the risks?", ideas: [{ bucket: "People", items: ["attrition"] }] },
      { id: "q5", kind: "recommendation", ask: "The partner wants your answer." },
    ],
    recommendation: { answer: "Buy, below US$360m.", reasoning: ["a"], risks: ["b"], next: ["c"] },
    ...over,
  };
}

const lib = (cases: CaseSheet[]) => ({ cases });

describe("parseCaseLibrary", () => {
  it("accepts a well-formed case", () => {
    expect(parseCaseLibrary(lib([sheet()])).cases).toHaveLength(1);
  });

  it("rejects duplicate case ids", () => {
    expect(() => parseCaseLibrary(lib([sheet(), sheet()]))).toThrow(/duplicate case id/i);
  });

  it("rejects duplicate question or fact ids inside a case", () => {
    const s = sheet();
    s.questions[1] = { ...s.questions[1], id: "q1" };
    expect(() => parseCaseLibrary(lib([s]))).toThrow(/duplicate question id/i);
    expect(() =>
      parseCaseLibrary(lib([sheet({ facts: [sheet().facts[0], sheet().facts[0]] })])),
    ).toThrow(/duplicate fact id/i);
  });

  it("insists a case opens with a structure question and closes with a recommendation", () => {
    const s = sheet();
    expect(() => parseCaseLibrary(lib([{ ...s, questions: s.questions.slice(1) }]))).toThrow(/open with a structure/i);
    expect(() => parseCaseLibrary(lib([{ ...s, questions: s.questions.slice(0, -1) }]))).toThrow(/close with a recommendation/i);
  });

  it("requires every math question to carry a checkable answer", () => {
    const s = sheet();
    const { answer: _drop, ...noAnswer } = s.questions[1];
    s.questions[1] = noAnswer;
    expect(() => parseCaseLibrary(lib([s]))).toThrow(/math question q2 needs an answer/i);
  });

  it("requires every chart question to carry an exhibit whose rows match its columns", () => {
    const s = sheet();
    const { exhibit: _drop, ...noExhibit } = s.questions[2];
    expect(() => parseCaseLibrary(lib([{ ...s, questions: [s.questions[0], s.questions[1], noExhibit, ...s.questions.slice(3)] }]))).toThrow(
      /chart question q3 needs an exhibit/i,
    );
    const ragged = sheet();
    ragged.questions[2] = { ...ragged.questions[2], exhibit: { title: "x", columns: ["a", "b"], rows: [["only one"]] } };
    expect(() => parseCaseLibrary(lib([ragged]))).toThrow(/row 1 of the exhibit in q3/i);
  });

  it("ignores documentation keys", () => {
    expect(parseCaseLibrary({ _readme: ["hi"], cases: [sheet()] }).cases).toHaveLength(1);
  });
});

describe("casesFor", () => {
  it("filters by firm and case type, with 'all' meaning no filter", () => {
    const l = parseCaseLibrary(lib([sheet(), sheet({ id: "c2", firm: "bcg", caseType: "pe-due-diligence" })]));
    expect(casesFor(l, { firm: "bain" }).map((c) => c.id)).toEqual(["c1"]);
    expect(casesFor(l, { caseType: "pe-due-diligence" }).map((c) => c.id)).toEqual(["c2"]);
    expect(casesFor(l, { firm: "all", caseType: "all" })).toHaveLength(2);
  });
});

describe("the shipped case library (data/interview/cases.json)", () => {
  const l = parseCaseLibrary(shipped);

  it("has ten Bain cases, all candidate-led as Bain runs them", () => {
    const bain = casesFor(l, { firm: "bain" });
    expect(bain).toHaveLength(10);
    expect(bain.every((c) => c.style === "candidate-led")).toBe(true);
  });

  it("leans on M&A in technology, with private-equity cases in the mix", () => {
    const types = l.cases.map((c) => c.caseType);
    expect(types.filter((t) => t === "m-and-a" || t === "merger" || t === "post-merger-integration").length).toBeGreaterThanOrEqual(6);
    expect(types.filter((t) => t.startsWith("pe-")).length).toBeGreaterThanOrEqual(2);
  });

  it("gives every case at least one math question and one brainstorm", () => {
    for (const c of l.cases) {
      expect(c.questions.some((q) => q.kind === "math"), c.id).toBe(true);
      expect(c.questions.some((q) => q.kind === "brainstorm"), c.id).toBe(true);
    }
  });

  it("states every math answer's working, so the debrief can show it", () => {
    for (const c of l.cases) for (const q of c.questions) if (q.kind === "math") expect(q.answer?.working.length, `${c.id}/${q.id}`).toBeGreaterThan(0);
  });
});
