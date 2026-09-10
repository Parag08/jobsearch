import { describe, it, expect } from "vitest";
import * as stories from "./index";

describe("lib/stories public API", () => {
  it("exports the schema, vocab and the five functions", () => {
    expect(stories.StorySchema).toBeDefined();
    expect(stories.DEFAULT_COMPETENCIES).toHaveLength(10);
    expect(typeof stories.inferCompetencies).toBe("function");
    expect(typeof stories.storyGapReport).toBe("function");
    expect(typeof stories.numberConsistency).toBe("function");
    expect(typeof stories.extractNumbers).toBe("function");
    expect(typeof stories.prepSet).toBe("function");
  });
});
