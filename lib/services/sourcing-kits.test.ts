import { describe, expect, it, vi } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { approveKitDraft, confirmSourcingSubmission, getSourcingKit, prepareSourcingBatch, requestKitDraft,
  saveKitDraft, setSafeKitEvidence, saveCompanyResearch, saveRankReview, getUsableSourcingKit } from "./sourcing-kits";
import { SafeDraft, draftText, fitsAnswer, sourceForCompany } from "../watchlist/safe-kit";
import { putSafeEvidence, setSourcingCompanyActive } from "../repos/sourcing";

const today = "2026-11-26";
function setup(db = new FakeDb()) {
  db.seed("profiles", [{ user_id: "u", sourcing_evidence: ["discovery"] }]);
  db.seed("sourcing_companies", [{
    id: "company", user_id: "u", active: true, name: "Harbour", identity: "harbour", website: "https://harbour.example.com",
    research_requested: true, research_version: 0,
  }]);
  db.seed("sourced_jobs", [
    { id: "a", user_id: "u", company_id: "company", source: "lever", external_id: "a", title: "Product Manager",
      company: "Harbour", location: "Singapore", url: "https://jobs.lever.co/harbour/a?email=candidate@example.com",
      posted_at: today, score: 80, status: "new", sourcing_decision: "picked" },
    { id: "b", user_id: "u", company_id: "company", source: "lever", external_id: "b", title: "Product Lead",
      company: "Harbour", location: null, url: null, posted_at: null, score: null, status: "new" },
  ]);
  return db;
}

describe("daily sourcing kits", () => {
  it("creates only selected roles as Saved, without a raw JD, personal CV or automatic drafts", async () => {
    const db = setup();
    const result = await prepareSourcingBatch(db, "u", today);
    expect(result.applicationIds).toHaveLength(1);
    expect(result.failedRoleIds).toEqual([]);
    const row = db.rows("applications")[0]!;
    expect(row).toMatchObject({ stage: "saved", jd_raw: null, cv_id: null, applied_at: null, external_ref: "sourced:a",
      apply_url: "https://jobs.lever.co/harbour/a", sourcing_kit: { evidence: ["discovery"], letter: null, answer: null } });
    expect((await prepareSourcingBatch(db, "u", today)).applicationIds).toEqual([]);
    expect(db.rows("applications")).toHaveLength(1);
  });

  it("keeps preparing other picked roles when one cannot be saved", async () => {
    const db = setup();
    await db.from("sourced_jobs").update({ sourcing_decision: "picked" }).eq("id", "b");
    const applications = db.from("applications");
    const insert = applications.insert.bind(applications);
    vi.spyOn(applications, "insert").mockImplementation((row) => {
      if (!Array.isArray(row) && row.external_ref === "sourced:a") throw new Error("Test write failure");
      return insert(row);
    });
    const from = db.from.bind(db);
    const failingDb = { from: (table: Parameters<typeof from>[0]) => table === "applications" ? applications : from(table) } as typeof db;
    const result = await prepareSourcingBatch(failingDb, "u", today);
    expect(result.failedRoleIds).toEqual(["a"]);
    expect(result.applicationIds).toHaveLength(1);
    expect(db.rows("applications")[0]?.external_ref).toBe("sourced:b");
  });

  it("only confirms the exact owned kit; retries cannot rewrite the date, material choice, or version", async () => {
    const db = setup();
    const { applicationIds: [id] } = await prepareSourcingBatch(db, "u", today);
    if (!id) throw new Error("missing kit");
    const submitted = { date: today, confirmedByUser: true as const, materials: "reviewed" as const, revision: 0 };
    await expect(confirmSourcingSubmission(db, "other", id, submitted, today, 7)).rejects.toThrow();
    await expect(confirmSourcingSubmission(db, "u", id, submitted, today, 7)).rejects.toThrow(/review/i);
    await setSafeKitEvidence(db, "u", id, ["discovery"], true);
    const first = await confirmSourcingSubmission(db, "u", id, { ...submitted, revision: 1 }, today, 7);
    const second = await confirmSourcingSubmission(db, "u", id, { ...submitted, date: "2026-11-10", materials: "different" }, today, 7);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ date: today, materials: "reviewed", version: 1 });
    expect(db.rows("applications")[0]).toMatchObject({ stage: "applied", applied_at: today, next_action: expect.stringContaining("Follow up") });
    await expect(setSafeKitEvidence(db, "u", id, [], false)).rejects.toThrow(/Saved/);
  });

  it("retains shared research and saved roles when target membership changes", async () => {
    const db = setup();
    await prepareSourcingBatch(db, "u", today);
    await saveCompanyResearch(db, "u", "company", 0, [{
      kind: "product-documentation", url: "https://harbour.example.com/docs/platform", checkedAt: today,
    }], today);
    await setSourcingCompanyActive(db, "u", "company", false);
    expect(db.rows("sourcing_companies")[0]).toMatchObject({ active: false, research_version: 1 });
    expect(db.rows("applications")).toHaveLength(1);
    expect(db.rows("sourced_jobs")[0]?.sourcing_decision).toBe("available");
    await setSourcingCompanyActive(db, "u", "company", true);
    expect((await prepareSourcingBatch(db, "u", today)).applicationIds).toEqual([]);
  });

  it("rejects unstructured draft fields and private research links, and enforces answer limits", () => {
    expect(SafeDraft.safeParse({ evidence: "discovery", tone: "direct", text: "Candidate name" }).success).toBe(false);
    expect(sourceForCompany("https://attacker.example.com/docs", "https://harbour.example.com")).toBeNull();
    expect(sourceForCompany("https://harbour.example.com/docs?email=name@example.com", "https://harbour.example.com")).toBeNull();
    expect(sourceForCompany("https://harbour.example.com/docs/people/some-person", "https://harbour.example.com")).toBeNull();
    expect(fitsAnswer(draftText({ evidence: "discovery", tone: "direct" }, "related-experience"), { unit: "words", limit: 2, prompt: "related-experience" })).toBe(false);
  });

  it("only saves requested drafts, checks limits and revokes approval when edited", async () => {
    const db = setup();
    const { applicationIds: [id] } = await prepareSourcingBatch(db, "u", today);
    const draft = { evidence: "discovery", tone: "direct" } as const;
    await expect(saveKitDraft(db, "u", id, "answer", draft, 0)).rejects.toThrow(/requested/);
    await requestKitDraft(db, "u", id, "answer", { limit: 2, unit: "words", prompt: "related-experience" });
    await saveKitDraft(db, "u", id, "answer", draft, 1);
    await expect(approveKitDraft(db, "u", id, "answer", 2)).rejects.toThrow(/Shorten/);
    await requestKitDraft(db, "u", id, "answer", { limit: 60, unit: "words", prompt: "related-experience" });
    await saveKitDraft(db, "u", id, "answer", draft, 3);
    await approveKitDraft(db, "u", id, "answer", 4);
    await expect(saveKitDraft(db, "u", id, "answer", { ...draft, tone: "context-first" }, 4)).rejects.toThrow(/changed/);
    await expect(saveKitDraft(db, "u", id, "answer", { ...draft, tone: "context-first" }, 5)).rejects.toThrow(/confirm/i);
    expect(await saveKitDraft(db, "u", id, "answer", draft, 5)).toBe(5);
    await saveKitDraft(db, "u", id, "answer", { ...draft, tone: "context-first" }, 5, true);
    expect((await getSourcingKit(db, "u", id))?.value.answer?.approved).toBe(false);
  });

  it("requires confirmation to replace a fit review even after a claim is revoked", async () => {
    const db = setup();
    const review = { evidence: ["discovery" as const], uncertainty: "scope" as const };
    await saveRankReview(db, "u", "a", review);
    await saveRankReview(db, "u", "a", review);
    await putSafeEvidence(db, "u", ["delivery"]);
    const replacement = { ...review, evidence: ["delivery" as const] };
    await expect(saveRankReview(db, "u", "a", replacement)).rejects.toThrow(/confirm/i);
    await expect(saveRankReview(db, "u", "a", replacement, true)).resolves.toEqual(replacement);
  });

  it("does not expose or use withdrawn claims in unsent kits", async () => {
    const db = setup();
    const { applicationIds: [id] } = await prepareSourcingBatch(db, "u", today);
    const draft = { evidence: "discovery", tone: "direct" } as const;
    await requestKitDraft(db, "u", id, "letter");
    await saveKitDraft(db, "u", id, "letter", draft, 1);
    await putSafeEvidence(db, "u", []);
    expect((await getUsableSourcingKit(db, "u", id))?.value).toMatchObject({
      evidence: [], cvReviewed: false, letter: { draft: null, approved: false },
    });
    await expect(saveKitDraft(db, "u", id, "letter", draft, 2)).rejects.toThrow(/verified/i);
    await expect(approveKitDraft(db, "u", id, "letter", 2)).rejects.toThrow(/verified/i);
  });

  it("renders the requested portal question using the same verified claim", () => {
    const draft = { evidence: "discovery", tone: "direct" } as const;
    const prompts = ["approach-to-work", "work-highlight", "related-experience"] as const;
    const answers = prompts.map((prompt) => draftText(draft, prompt));
    expect(new Set(answers).size).toBe(3);
    expect(answers[0]).toMatch(/I approach/i);
    expect(answers[1]).toMatch(/one example/i);
  });
});
