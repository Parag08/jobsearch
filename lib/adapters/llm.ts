import { JdExtractSchema, type JdExtract } from "../types";

/**
 * Provider-agnostic LLM boundary (spec section 5: swappable adapters).
 * Token rule #5 (model routing) lives here: cheap/free models do extraction
 * and classification; the premium tier is reserved for writing the user sees.
 */
export type LlmTask =
  | "extract-jd"
  | "classify-sector"
  | "summarize-node"
  | "polish-cv"
  | "draft-outreach";

export interface ModelRoute {
  tier: "small" | "premium";
}

export function routeModel(task: LlmTask): ModelRoute {
  switch (task) {
    case "polish-cv":
    case "draft-outreach":
      return { tier: "premium" };
    default:
      return { tier: "small" };
  }
}

export interface LlmProvider {
  /** Parse a raw JD ONCE into the structured extract (token rule #1). */
  extractJd(rawJd: string): Promise<JdExtract>;
  /** Refresh a sector node's ~150-token cached summary. */
  summarizeNode(nodeJson: string): Promise<string>;
}

/** Test double: stub responses, record calls. Real providers (Gemini/Groq) land behind the same interface. */
export class FakeLlm implements LlmProvider {
  calls: { task: LlmTask; input: string }[] = [];
  private jdExtract: JdExtract | null = null;
  private summary = "";

  stubJdExtract(e: JdExtract): void {
    this.jdExtract = JdExtractSchema.parse(e);
  }
  stubSummary(s: string): void {
    this.summary = s;
  }

  async extractJd(rawJd: string): Promise<JdExtract> {
    this.calls.push({ task: "extract-jd", input: rawJd });
    if (!this.jdExtract) throw new Error("FakeLlm: no JdExtract stubbed");
    return this.jdExtract;
  }

  async summarizeNode(nodeJson: string): Promise<string> {
    this.calls.push({ task: "summarize-node", input: nodeJson });
    return this.summary;
  }
}
