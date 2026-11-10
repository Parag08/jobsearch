import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_FALLBACK,
  applyFollowUp,
  buildFollowUpPrompt,
  buildMockDebriefPrompt,
  closeMock,
  followUpsAsked,
  guardFollowUp,
  mockTranscript,
  nextStep,
  parseFollowUp,
  parseMockDebrief,
  parseMockSession,
  probeCandidates,
  startMock,
  type MockSession,
} from "./mock";

const NOW = "2026-11-10T10:00:00.000Z";
const question = { id: "q-conflict", text: "Tell me about a time you disagreed with a senior stakeholder." };

const vagueWe =
  "We had a disagreement with the client about the roadmap. We talked it through with them and we aligned on a plan and the team delivered it.";
const strongI =
  "I disagreed with our COO about cutting the nurse rota. I rebuilt the model myself, showed him that it raised overtime cost, and I proposed a phased plan. " +
  "It cut overtime by 30% in two months. In hindsight I would have brought finance in earlier.";

function running(overrides: Partial<MockSession> = {}): MockSession {
  return { ...startMock(question, { tone: "neutral", maxFollowUps: 3 }, NOW), ...overrides };
}

describe("startMock", () => {
  it("opens with the interviewer asking the question", () => {
    const s = startMock(question, { tone: "tough", maxFollowUps: 2 }, NOW);
    expect(s).toEqual({
      questionId: "q-conflict",
      tone: "tough",
      maxFollowUps: 2,
      status: "running",
      turns: [{ role: "interviewer", text: question.text, at: NOW }],
    });
  });

  it("refuses a follow-up count outside 0-4", () => {
    expect(() => startMock(question, { tone: "neutral", maxFollowUps: -1 }, NOW)).toThrow();
    expect(() => startMock(question, { tone: "neutral", maxFollowUps: 1.5 }, NOW)).toThrow();
    expect(() => startMock(question, { tone: "neutral", maxFollowUps: 5 }, NOW)).toThrow();
  });
});

describe("probeCandidates", () => {
  it("flags 'we' over 'I', no measurable result and no reflection in a vague answer", () => {
    const c = probeCandidates(running(), vagueWe, "");
    expect(c).toEqual(expect.arrayContaining(["ownership", "result", "reflection"]));
    expect(c).not.toContain("numbers");
  });

  it("asks only for depth when the answer already covers the basics", () => {
    expect(probeCandidates(running(), strongI, "")).toEqual(["depth"]);
  });

  it("flags a number said aloud that the written answer does not contain", () => {
    const c = probeCandidates(running(), strongI.replace("30%", "40%"), "Overtime fell by 30%.");
    expect(c[0]).toBe("numbers");
  });

  it("flags a very short answer as lacking specifics", () => {
    expect(probeCandidates(running(), "I handled it well and it worked out.", "")).toContain("specificity");
  });

  it("never offers a probe that was already asked", () => {
    const s = applyFollowUp(running(), vagueWe, { probe: "ownership", say: "What did you do?" }, NOW);
    expect(probeCandidates(s, "We still did it together as a team.", "")).not.toContain("ownership");
  });

  it("judges the whole conversation so far, not just the latest answer", () => {
    const s = applyFollowUp(running(), strongI, { probe: "depth", say: "Why that plan?" }, NOW);
    // The latest answer has no number, but the first one did - so result is covered.
    expect(probeCandidates(s, "Because the phased plan let me test it on one ward first.", "")).not.toContain("result");
  });
});

describe("nextStep", () => {
  it("closes straight after the first answer with no follow-ups (quick practice)", () => {
    expect(nextStep(running({ maxFollowUps: 0 }), vagueWe, "")).toEqual({ kind: "close" });
  });

  it("probes while follow-ups remain and there is something to probe", () => {
    expect(nextStep(running(), vagueWe, "")).toEqual({ kind: "probe", candidates: expect.any(Array) });
  });

  it("closes once the follow-up limit is reached", () => {
    let s = running({ maxFollowUps: 1 });
    s = applyFollowUp(s, vagueWe, { probe: "ownership", say: "What did you do?" }, NOW);
    expect(followUpsAsked(s)).toBe(1);
    expect(nextStep(s, "I ran the workshop.", "")).toEqual({ kind: "close" });
  });

  it("closes when every probe has been used", () => {
    let s = running({ maxFollowUps: 4 });
    s = applyFollowUp(s, strongI, { probe: "depth", say: "Why that plan?" }, NOW);
    expect(nextStep(s, strongI, "")).toEqual({ kind: "close" });
  });
});

describe("buildFollowUpPrompt", () => {
  const prompt = buildFollowUpPrompt({
    question: question.text,
    lookFor: "Handles conflict with evidence, keeps the relationship",
    firmNote: "Bain likes a clear answer first.",
    session: running({ tone: "tough" }),
    latest: vagueWe,
    candidates: ["ownership", "result"],
  });

  it("offers only the candidate probes and asks for JSON", () => {
    expect(prompt).toContain('"probe"');
    expect(prompt).toContain("ownership");
    expect(prompt).toContain("result");
    expect(prompt).not.toMatch(/^- reflection:/m);
  });

  it("carries the tone, the rubric, the firm note and the latest answer", () => {
    expect(prompt).toMatch(/sceptical/i);
    expect(prompt).toContain("Handles conflict with evidence");
    expect(prompt).toContain("Bain likes a clear answer first.");
    expect(prompt).toContain(vagueWe);
  });

  it("forbids inventing facts or answering for the candidate", () => {
    expect(prompt).toMatch(/never state a fact or number the candidate did not say/i);
  });
});

describe("parseFollowUp", () => {
  it("accepts a probe from the candidates and tidies the line", () => {
    expect(parseFollowUp({ probe: "result", say: "  So what   changed?  " }, ["ownership", "result"])).toEqual({
      probe: "result",
      say: "So what changed?",
    });
  });

  it("falls back to the first candidate when the model names another probe", () => {
    expect(parseFollowUp({ probe: "reflection", say: "What would you change?" }, ["ownership", "result"]).probe).toBe("ownership");
  });

  it("throws on an empty line", () => {
    expect(() => parseFollowUp({ probe: "result", say: "  " }, ["result"])).toThrow();
  });

  it("caps a runaway line", () => {
    expect(parseFollowUp({ probe: "result", say: "x".repeat(900) }, ["result"]).say.length).toBeLessThanOrEqual(400);
  });
});

describe("guardFollowUp", () => {
  it("keeps a line whose numbers the candidate or the written answer supplied", () => {
    const reply = { probe: "numbers" as const, say: "You said 40% but wrote 30%. Which is it?" };
    expect(guardFollowUp(reply, running(), "It cut overtime by 40%.", "Overtime fell 30%.")).toEqual(reply);
  });

  it("replaces a line that states a number nobody said", () => {
    const reply = { probe: "result" as const, say: "So revenue grew 25%, right?" };
    expect(guardFollowUp(reply, running(), vagueWe, "")).toEqual({ probe: "result", say: FOLLOW_UP_FALLBACK.result });
  });
});

describe("applyFollowUp and closeMock", () => {
  it("records the answer, then the interviewer's probe", () => {
    const s = applyFollowUp(running(), vagueWe, { probe: "ownership", say: "What did you do?" }, NOW);
    expect(s.turns.slice(1)).toEqual([
      { role: "candidate", text: vagueWe, at: NOW },
      { role: "interviewer", text: "What did you do?", probe: "ownership", at: NOW },
    ]);
    expect(s.status).toBe("running");
  });

  it("closes with the last answer and a closing line", () => {
    const s = closeMock(running(), strongI, NOW);
    expect(s.status).toBe("done");
    expect(s.turns.at(-2)).toEqual({ role: "candidate", text: strongI, at: NOW });
    expect(s.turns.at(-1)?.role).toBe("interviewer");
  });

  it("can close early without a new answer", () => {
    const s = closeMock(applyFollowUp(running(), vagueWe, { probe: "result", say: "What changed?" }, NOW), null, NOW);
    expect(s.status).toBe("done");
    expect(s.turns.filter((t) => t.role === "candidate")).toHaveLength(1);
  });

  it("refuses to add turns to a finished interview", () => {
    const done = closeMock(running(), strongI, NOW);
    expect(() => applyFollowUp(done, "more", { probe: "depth", say: "?" }, NOW)).toThrow(/finished/);
    expect(() => closeMock(done, "more", NOW)).toThrow(/finished/);
  });
});

describe("mockTranscript", () => {
  it("labels each turn", () => {
    const s = applyFollowUp(running(), vagueWe, { probe: "ownership", say: "What did you do?" }, NOW);
    expect(mockTranscript(s)).toBe(`Interviewer: ${question.text}\nYou: ${vagueWe}\nInterviewer: What did you do?`);
  });
});

describe("debrief", () => {
  const s = closeMock(applyFollowUp(running(), vagueWe, { probe: "ownership", say: "What did you do?" }, NOW), "I ran the workshop.", NOW);

  it("asks for the six scores plus a verdict on each follow-up", () => {
    const p = buildMockDebriefPrompt({ question: question.text, lookFor: "Evidence", firmNote: null, session: s });
    for (const d of ["structure", "ownership", "specificity", "impact", "reflection", "relevance"]) expect(p).toContain(d);
    expect(p).toContain('"followUps"');
    expect(p).toContain("I ran the workshop.");
  });

  it("passes measured delivery to the model only when there is some", () => {
    const line = "Measured delivery (from the microphone, not judged): pace 190 words/min.";
    const withVoice = buildMockDebriefPrompt({ question: question.text, lookFor: "Evidence", firmNote: null, session: s, delivery: line });
    expect(withVoice).toContain(line);
    expect(withVoice).toMatch(/never guess at tone/);
    expect(buildMockDebriefPrompt({ question: question.text, lookFor: "Evidence", firmNote: null, session: s })).not.toMatch(/Measured delivery/);
  });

  it("parses scores and keeps only verdicts for probes that were asked", () => {
    const d = parseMockDebrief(
      {
        scores: { structure: 3, ownership: 2, specificity: 2, impact: 1, reflection: 2, relevance: 4 },
        strengths: ["Answered the question"],
        improvements: ["Say what you did"],
        followUps: [
          { probe: "ownership", verdict: "weak", note: "Still 'we'." },
          { probe: "result", verdict: "held", note: "Never asked." },
        ],
      },
      s,
    );
    expect(d.scores.impact).toBe(1);
    expect(d.followUps).toEqual([{ probe: "ownership", verdict: "weak", note: "Still 'we'." }]);
  });

  it("throws when a score is missing", () => {
    expect(() => parseMockDebrief({ scores: { structure: 3 }, followUps: [] }, s)).toThrow();
  });
});

describe("parseMockSession", () => {
  it("round-trips a real session", () => {
    const s = applyFollowUp(running(), vagueWe, { probe: "ownership", say: "What did you do?" }, NOW);
    expect(parseMockSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("rejects a session with too many turns or oversized text", () => {
    const s = running();
    const many = { ...s, turns: Array.from({ length: 30 }, () => s.turns[0]) };
    expect(() => parseMockSession(many)).toThrow();
    expect(() => parseMockSession({ ...s, turns: [{ ...s.turns[0], text: "x".repeat(6001) }] })).toThrow();
  });
});
