import { describe, it, expect } from "vitest";
import {
  applicationGaps,
  collisionAudit,
  composeSelection,
  fitToPage,
  pageFit,
  repeatedPhraseAudit,
  resolveText,
  type EditorialBullet,
  type ScoredCandidate,
} from "./index";
import type { JdExtract } from "../types";

/**
 * End to end: master + scored candidates -> composeSelection (a pin against the
 * ranking, one org capped at 2, one exclude) -> fitToPage on a tight budget ->
 * audits -> gaps. Neutral fixture; same shape as data/cvbuilder.
 */

function eb(id: string, orgId: string, text: string, skills: string[], extra: Partial<EditorialBullet> = {}): EditorialBullet {
  return { id, projectId: `p-${orgId}`, roleFamily: "product-management", text, skills, orgId, ...extra };
}

const bank: Record<string, EditorialBullet> = {
  a1: eb("a1", "org-a", "Diagnosed the cost base of a 1,200-vehicle fleet and sized two strategies cutting operating cost by up to 30%, presenting the case to the CEO", ["cost analysis", "executive communication"], {
    strength: 4,
    variants: [{ label: "short", text: "Sized two strategies cutting fleet operating cost by up to 30%, presented to the CEO" }],
  }),
  a2: eb("a2", "org-a", "Built the product roadmap for the route-planning app with the operations team, defining 20 core features from field interviews", ["product roadmap", "user research"], {
    strength: 3,
    variants: [{ label: "short", text: "Defined 20 core features for the route-planning app roadmap from field interviews" }],
  }),
  a3: eb("a3", "org-a", "Ran weekly steering reviews with plant leadership on cost-saving progress", ["executive communication"], { strength: 2 }),
  b1: eb("b1", "org-b", "Grew annual contract value of the storage product line to $40M by leading pricing and packaging for enterprise accounts", ["revenue", "enterprise sales", "pricing"], {
    strength: 5,
    variants: [{ label: "short", text: "Grew the storage line's ACV to $40M through enterprise pricing and packaging" }],
  }),
  b2: eb("b2", "org-b", "Closed $1M+ recurring revenue from three enterprise customers migrating file workloads onto the platform", ["revenue", "enterprise sales"], { strength: 4 }),
  c1: eb("c1", "org-c", "Took a blockchain platform from zero to MVP as a founding member, owning the product roadmap and the technical architecture", ["zero to one", "architecture"], { strength: 3 }),
  c2: eb("c2", "org-c", "Organised the annual engineering offsite for 60 people", ["event management"], { strength: 1 }),
  d1: eb("d1", "org-d", "Mentored six junior analysts, lifting their review scores 15% over two cycles", ["mentorship"], { strength: 3 }),
};

const master = ["a1", "a2", "b1", "c1", "c2"];
const candidates: ScoredCandidate[] = [
  { bulletId: "b1", score: 9 },
  { bulletId: "a1", score: 8 },
  { bulletId: "b2", score: 7 },
  { bulletId: "a2", score: 5 },
  { bulletId: "c1", score: 4 },
  { bulletId: "a3", score: 3 },
  { bulletId: "d1", score: 1 },
];

const jd: JdExtract = {
  company: "Firm X",
  role: "Consultant",
  roleFamily: "consulting",
  sectorPath: ["Consulting", "Private Equity"],
  skills: ["cost analysis", "technology due diligence", "mentorship"],
  keywords: ["enterprise customers", "ACV", "recurring revenue", "private equity"],
  seniority: null,
  visaNote: null,
  location: null,
};

const page = { pageSize: "A4" as const, scale: 1 };
const summaryLine = "Product leader with operator and consulting depth, targeting Consultant at Firm X.";

describe("editorial layer, end to end", () => {
  const selection = composeSelection({
    masterBulletIds: master,
    candidates,
    bank,
    pins: [{ bulletId: "d1", reason: "JD names coaching junior team members as a criterion; the scorer buries it" }],
    orgCaps: { "org-a": 2 },
    excludes: ["c2"],
  });

  it("selects: pin first, master spine, best candidate appended; cap and exclude explained", () => {
    expect(selection.bulletIds).toEqual(["d1", "a1", "a2", "b1", "c1", "b2"]);
    const why = Object.fromEntries(selection.decisions.map((d) => [d.bulletId, d]));
    expect(why.d1).toMatchObject({ kind: "pinned", included: true });
    expect(why.d1.reason).toMatch(/coaching/);
    expect(why.a3).toMatchObject({ kind: "capped", included: false });
    expect(why.c2).toMatchObject({ kind: "excluded", included: false });
    expect(why.b2).toMatchObject({ kind: "scored", included: true, score: 7 });
  });

  const texts = (ids: string[], variants: Record<string, string> = {}) =>
    ids.map((id) => resolveText(bank[id], { variant: variants[id] }));
  const base = pageFit({ bullets: texts(selection.bulletIds), summaryLine, overheadLines: 0 }, page);

  it("the fixture lays out as expected: one-line pin, two-line bullets", () => {
    expect(base.perBullet).toEqual([1, 2, 2, 2, 2, 2]);
  });

  it("one line over: a short variant is preferred over a cut, taken from the lowest-scoring shortable bullet", () => {
    const overheadLines = base.lineBudget - base.linesUsed + 1; // exactly 1 line over
    const fitted = fitToPage(selection, bank, { ...page, summaryLine, overheadLines });
    expect(fitted.actions).toEqual([{ kind: "short-variant", bulletId: "a2", from: null, linesSaved: 1 }]);
    expect(fitted.bulletIds).toEqual(selection.bulletIds); // nothing cut
    expect(fitted.variants).toEqual({ a2: "short" });
    expect(fitted.fit.overflow).toBe(0);
  });

  it("four lines over: every short variant is used before anything is cut, and the pinned bullet survives the cut", () => {
    const overheadLines = base.lineBudget - base.linesUsed + 4;
    const fitted = fitToPage(selection, bank, { ...page, summaryLine, overheadLines });
    expect(fitted.actions.map((a) => `${a.kind}:${a.bulletId}`)).toEqual([
      "short-variant:a2",
      "short-variant:a1",
      "short-variant:b1",
      "drop:c1", // lowest-scoring UNPINNED - d1 scores lower but is pinned
    ]);
    expect(fitted.bulletIds).toContain("d1");
    expect(fitted.bulletIds).not.toContain("c1");
    expect(fitted.fit.overflow).toBe(0);
  });

  it("audits the page as it will be sent: a skills collision, and a repeated phrase the short variant happens to clear", () => {
    const auditInput = (ids: string[], variants: Record<string, string>) =>
      ids.map((id, i) => ({ id, text: texts(ids, variants)[i], skills: bank[id].skills }));

    const beforeFit = auditInput(selection.bulletIds, {});
    expect(repeatedPhraseAudit(beforeFit)).toEqual([{ phrase: "the product roadmap", bulletIds: ["a2", "c1"] }]);

    const fitted = fitToPage(selection, bank, { ...page, summaryLine, overheadLines: base.lineBudget - base.linesUsed + 1 });
    const afterFit = auditInput(fitted.bulletIds, fitted.variants);
    expect(repeatedPhraseAudit(afterFit)).toEqual([]);

    const collisions = collisionAudit(afterFit);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ a: "b1", b: "b2", basis: "skills" });
  });

  it("gaps: what the CV cannot honestly claim is handed to the cover letter; variant text counts as evidence", () => {
    const g = applicationGaps(jd, Object.values(bank));
    expect(g.gaps).toEqual([
      { term: "technology due diligence", kind: "skill" },
      { term: "private equity", kind: "keyword" },
    ]);
    expect(g.evidenced.find((e) => e.term === "acv")?.bulletIds).toEqual(["b1"]); // only via b1's short variant
    expect(g.evidenced.find((e) => e.term === "mentorship")?.bulletIds).toEqual(["d1"]);
  });
});
