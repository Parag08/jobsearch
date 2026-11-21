import { describe, it, expect } from "vitest";
import { echoProbe, groundingProblems, numberValues, shortenFollowUp } from "./grounding";

// The 20 Nov leak: the background answer never said "stuck for two years"; only the model answer did.
const BACKGROUND =
  "I started as a backend engineer at Nutanix, then I moved to product. My biggest project was the files migration, where I owned the cut-over plan and we moved ten petabytes.";
const QUESTION = "Walk me through your background.";

describe("numberValues", () => {
  it("reads digits and numbers written as words to the same value", () => {
    expect(numberValues("stuck for two years")).toEqual([2]);
    expect(numberValues("a thousand users and 1,000 more")).toEqual([1000, 1000]);
    expect(numberValues("ten petabytes")).toEqual([10]);
    expect(numberValues("$2.1M and two point five")).toContain(2100000);
    expect(numberValues("twenty five people, 3k requests, 40%").sort((a, b) => a - b)).toEqual([25, 40, 3000]);
    expect(numberValues("a dozen teams")).toEqual([12]);
  });

  it("ignores 'one' and 'a' used as words, and bare years", () => {
    expect(numberValues("Take me to one specific moment. Which one?")).toEqual([]);
    expect(numberValues("In 2019 I joined.")).toEqual([]);
  });
});

describe("groundingProblems", () => {
  const said = [BACKGROUND];
  const known = { said, questions: [QUESTION] };

  it("catches the 'stuck for two years' leak", () => {
    const leak = "You mentioned the files-migration feature was stuck for two years. What was the blocker?";
    const problems = groundingProblems(leak, known);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/2|stuck/);
  });

  it("catches a claimed quote the candidate never said", () => {
    expect(groundingProblems('You said "we rewrote the scheduler". Why?', known)).not.toEqual([]);
  });

  it("catches a proper noun the candidate never said", () => {
    expect(groundingProblems("Why did you pick Kafka over the alternatives?", known)).not.toEqual([]);
  });

  it("catches a 'you said' clause whose content words are not in the transcript", () => {
    expect(groundingProblems("You said the rollout was delayed by legal. Why?", known)).not.toEqual([]);
  });

  it("passes follow-ups built from what was said", () => {
    expect(groundingProblems("You said you owned the cut-over plan. What else did you consider?", known)).toEqual([]);
    expect(groundingProblems("You moved ten petabytes. How do you know it worked?", known)).toEqual([]);
    expect(groundingProblems("Why Nutanix?", known)).toEqual([]);
    expect(groundingProblems("You keep saying 'we'. What did you personally build?", known)).toEqual([]);
    expect(groundingProblems("What would have broken if you hadn't done that?", known)).toEqual([]);
  });

  it("allows numbers from the question itself", () => {
    expect(groundingProblems("Give me the 3 biggest risks.", { said, questions: ["Name 3 risks."] })).toEqual([]);
  });

  it("does not use anything outside what was said: the model answer is never in scope", () => {
    expect(groundingProblems("You said it was stuck. What was the blocker?", known)).not.toEqual([]);
  });
});

describe("shortenFollowUp", () => {
  it("keeps a short line as it is", () => {
    expect(shortenFollowUp("You said X. Why X?", 25)).toBe("You said X. Why X?");
  });
  it("keeps only the last question when the line runs long", () => {
    const long =
      "That's a really interesting answer and I appreciate the detail you gave about the migration and the teams involved in it. Why did you own the plan?";
    expect(shortenFollowUp(long, 25)).toBe("Why did you own the plan?");
  });
  it("returns empty when no short question can be kept", () => {
    expect(shortenFollowUp(Array(40).fill("word").join(" "), 25)).toBe("");
  });
});

describe("echoProbe", () => {
  it("builds a short probe from the candidate's own last words", () => {
    const line = echoProbe(BACKGROUND, "deepen") ?? "";
    expect(line).toMatch(/^You said "/);
    expect(line.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(groundingProblems(line, { said: [BACKGROUND], questions: [] })).toEqual([]);
  });
  it("prefers a sentence with a decision in it", () => {
    expect(echoProbe("It was a hard year. I chose to rewrite the sync job in Go. The team was happy.", "deepen")).toContain("rewrite the sync job");
  });
  it("returns null when there is nothing to echo", () => {
    expect(echoProbe("Yes.", "deepen")).toBeNull();
  });
});
