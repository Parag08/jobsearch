import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { getApplication } from "../repos/applications";
import { setSourcingDecision } from "../repos/sourcing";
import { getSourcingKit } from "../services/sourcing-kits";
import { DEMO_COOKIE, DEMO_KITS_COOKIE, DEMO_TTL_SECONDS } from "../demo/visitors";
import { demoVisitorToken } from "../demo/visitor-token";
import { confirmManualSubmission, prepareDailyBatch, saveKitEvidence, toggleTargetCompany, triageRole } from "../../app/app/sourcing-actions";
import { getWorkspace } from "./index";

vi.mock("server-only", () => ({}));
const { getCookie, setCookie } = vi.hoisted(() => ({ getCookie: vi.fn(), setCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie, set: setCookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not found"); },
  redirect: (path: string) => { throw new Error(path); },
}));
vi.mock("./supabase", async (importOriginal) => ({
  ...await importOriginal<typeof import("./supabase")>(),
  createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

const missingSupabase = /NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/;

beforeEach(() => {
  getCookie.mockReset();
  setCookie.mockReset();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
  vi.stubEnv("LOCAL_DEMO_MODE", undefined);
  vi.stubEnv("DEMO_MAX_VISITORS", undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getWorkspace", () => {
  it("rejects missing Supabase unless local demo is enabled", async () => {
    await expect(getWorkspace().then((w) => w?.mode)).rejects.toThrow(missingSupabase);
  });

  it("uses FakeDb when local demo is explicitly enabled in development", async () => {
    vi.stubEnv("LOCAL_DEMO_MODE", "true");
    await expect(getWorkspace()).resolves.toMatchObject({
      db: expect.any(FakeDb),
      mode: "demo",
      cannedAi: false,
    });
  });

  it("rejects a production deployment missing the Supabase key even with demo flags and a visitor cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
    vi.stubEnv("LOCAL_DEMO_MODE", "true");
    vi.stubEnv("DEMO_MAX_VISITORS", "2");
    getCookie.mockReturnValue({ value: "00000000-0000-0000-0000-000000000001" });
    await expect(getWorkspace().then((w) => w?.mode)).rejects.toThrow(missingSupabase);
  });

  it("preserves the public demo for a configured deployment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("DEMO_MAX_VISITORS", "2");
    vi.stubEnv("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", undefined);
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    getCookie.mockReturnValue({ value: "00000000-0000-0000-0000-000000000001" });
    await expect(getWorkspace()).resolves.toMatchObject({
      db: expect.any(FakeDb),
      mode: "demo",
      cannedAi: true,
    });
  });

  it("revisits a newly prepared public demo kit on a different instance", async () => {
    const secret = "test-only-secret-for-demo-journal";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", undefined);
    vi.stubEnv("SUPABASE_SECRET_KEY", secret);
    vi.stubEnv("DEMO_MAX_VISITORS", "10");
    vi.stubGlobal("__jobsearchVisitors", undefined);
    const idForVisitor = "00000000-0000-4000-8000-000000000001";
    const issued = Date.now() - 10 * 60_000;
    const browser = new Map([[DEMO_COOKIE, await demoVisitorToken(idForVisitor, secret, issued)]]);
    getCookie.mockImplementation((name: string) => ({ value: browser.get(name) }));
    setCookie.mockImplementation((name: string, value: string) => browser.set(name, value));

    const picker = (await getWorkspace())!;
    const role = (picker.db as FakeDb).rows("sourced_jobs").find((row) => row.external_id === "demo-1")!;
    await triageRole(role.id, "picked", "ranked");
    expect(setCookie).toHaveBeenCalledWith(DEMO_KITS_COOKIE, expect.any(String), expect.objectContaining({
      expires: new Date(issued + DEMO_TTL_SECONDS * 1000),
    }));
    expect(setCookie.mock.calls.some(([name]) => name === DEMO_COOKIE)).toBe(false);
    vi.stubGlobal("__jobsearchVisitors", undefined);
    const writer = (await getWorkspace())!;
    expect(writer.db).not.toBe(picker.db);
    const redirect = await prepareDailyBatch().then(() => "", (error: Error) => error.message);
    expect(redirect).toMatch(/^\/app\/applications\/[^/]+$/);
    const id = redirect.split("/").at(-1)!;
    const prepared = (await getSourcingKit(writer.db, writer.userId, id))!;
    expect(prepared.value.jobId).toBe(role.id);

    vi.stubGlobal("__jobsearchVisitors", undefined);
    const reader = (await getWorkspace())!;
    expect(reader.db).not.toBe(writer.db);
    expect(await getApplication(reader.db, reader.userId, id)).toMatchObject({ id, role: role.title });
    expect(await getSourcingKit(reader.db, reader.userId, id)).toEqual(prepared);

    const review = new FormData();
    prepared.value.evidence.forEach((code) => review.append("evidence", code));
    review.set("reviewed", "on");
    await expect(saveKitEvidence(id, prepared.revision, {}, review)).resolves.toEqual({});

    const journal = browser.get(DEMO_KITS_COOKIE)!;
    expect(journal.length).toBeLessThanOrEqual(3800);
    const [body, mac] = journal.split(".");
    browser.set(DEMO_KITS_COOKIE, body + "." + (mac[0] === "A" ? "B" : "A") + mac.slice(1));
    vi.stubGlobal("__jobsearchVisitors", undefined);
    const tampered = (await getWorkspace())!;
    expect(await getApplication(tampered.db, tampered.userId, id)).toBeNull();

    browser.set(DEMO_KITS_COOKIE, journal);
    const visitor = browser.get(DEMO_COOKIE)!;
    browser.set(DEMO_COOKIE, await demoVisitorToken("00000000-0000-4000-8000-000000000002", secret));
    const otherVisitor = (await getWorkspace())!;
    expect(await getApplication(otherVisitor.db, otherVisitor.userId, id)).toBeNull();

    browser.set(DEMO_COOKIE, visitor);
    vi.stubGlobal("__jobsearchVisitors", undefined);
    const afterReview = (await getWorkspace())!;
    expect(await getSourcingKit(afterReview.db, afterReview.userId, id)).toMatchObject({
      revision: prepared.revision + 1,
      value: { cvReviewed: true },
    });

    const confirmation = new FormData();
    confirmation.set("date", new Date().toISOString().slice(0, 10));
    confirmation.set("materials", "reviewed");
    confirmation.set("confirmed", "on");
    await expect(confirmManualSubmission(id, prepared.revision + 1, {}, confirmation))
      .rejects.toThrow("/app/applications/" + id);
    vi.stubGlobal("__jobsearchVisitors", undefined);
    const afterConfirm = (await getWorkspace())!;
    expect(await getApplication(afterConfirm.db, afterConfirm.userId, id)).toMatchObject({ stage: "applied" });
    expect(await getSourcingKit(afterConfirm.db, afterConfirm.userId, id)).toMatchObject({
      value: { submission: { materials: "reviewed", version: prepared.revision + 1 } },
    });

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + DEMO_TTL_SECONDS * 1000 + 1);
    vi.stubGlobal("__jobsearchVisitors", undefined);
    // The expired browser lease no longer resolves to a demo workspace.
    await expect(getWorkspace()).resolves.toBeNull();
    browser.set(DEMO_COOKIE, idForVisitor);
    await expect(getWorkspace()).resolves.toBeNull();
  });

  it("does not revive removed company picks when Undo reaches a different instance", async () => {
    const secret = "test-only-secret-for-demo-journal";
    vi.stubEnv("LOCAL_DEMO_MODE", "true");
    vi.stubEnv("SUPABASE_SECRET_KEY", secret);
    vi.stubEnv("DEMO_MAX_VISITORS", "10");
    vi.stubGlobal("__jobsearchVisitors", undefined);
    const visitorId = "00000000-0000-4000-8000-000000000001";
    const browser = new Map([[DEMO_COOKIE, await demoVisitorToken(visitorId, secret)]]);
    getCookie.mockImplementation((name: string) => ({ value: browser.get(name) }));
    setCookie.mockImplementation((name: string, value: string) => browser.set(name, value));

    const { db, userId } = (await getWorkspace())!;
    const sampleJobs = (db as FakeDb).rows("sourced_jobs");
    const role = sampleJobs.find((row) => row.external_id === "demo-1")!;
    const otherRole = sampleJobs.find((row) => row.external_id === "demo-2")!;
    await setSourcingDecision(db, userId, otherRole.id, "picked");
    await triageRole(role.id, "picked", "ranked");
    await expect(toggleTargetCompany(role.company_id!, false)).rejects.toThrow("/app/companies?removed=");
    vi.stubGlobal("__jobsearchVisitors", undefined);
    await expect(toggleTargetCompany(role.company_id!, true)).rejects.toThrow("/app/companies?restored=1");

    const restored = ((await getWorkspace())!.db as FakeDb).rows("sourced_jobs");
    expect(restored.find((row) => row.id === role.id)?.sourcing_decision).toBe("available");
    expect(restored.find((row) => row.id === otherRole.id)?.sourcing_decision).toBe("picked");
  });
});
