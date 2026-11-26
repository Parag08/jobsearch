import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as enterDemo } from "../../app/demo/route";
import { middleware } from "../../middleware";
import { DEMO_COOKIE, DEMO_KITS_COOKIE, DEMO_TTL_SECONDS } from "./visitors";
import { demoVisitorToken, readDemoVisitor } from "./visitor-token";

vi.mock("../db/supabase", () => ({ requireWorkspaceEnv: () => null }));

const id = "00000000-0000-4000-8000-000000000001";
const secret = "demo-lease-test-secret";
const now = Date.UTC(2026, 0, 1);
const journal = "payload." + "A".repeat(43);

beforeEach(() => {
  vi.stubEnv("DEMO_MAX_VISITORS", "10");
  vi.stubEnv("SUPABASE_SECRET_KEY", secret);
  vi.spyOn(Date, "now").mockReturnValue(now);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

type VisitOptions = { method?: string; headers?: Record<string, string> };

async function request(path: string, ageMinutes: number, init: VisitOptions = {}) {
  const token = await demoVisitorToken(id, secret, now - ageMinutes * 60_000);
  return new NextRequest("http://localhost" + path, {
    ...init,
    headers: { cookie: DEMO_COOKIE + "=" + token + "; " + DEMO_KITS_COOKIE + "=" + journal, ...init.headers },
  });
}

async function visit(ageMinutes: number, init: VisitOptions = {}) {
  const { cookies } = await middleware(await request("/app/watchlist", ageMinutes, init));
  return cookies;
}

describe("demo visitor lease renewal", () => {
  it("leaves a recently renewed visitor cookie alone", async () => {
    expect((await visit(10)).getAll()).toEqual([]);
  });

  it("renews an older lease on a workspace navigation, including actual RSC navigations", async () => {
    const renewed = await visit(16, { headers: { rsc: "1", "next-router-state-tree": "tree" } });
    const expiresAt = now + DEMO_TTL_SECONDS * 1000;
    await expect(readDemoVisitor(renewed.get(DEMO_COOKIE)?.value, secret, now)).resolves.toEqual({ id, expiresAt });
    expect(renewed.get(DEMO_COOKIE)?.expires).toEqual(new Date(expiresAt));
    expect(renewed.get(DEMO_KITS_COOKIE)).toMatchObject({ value: journal, expires: new Date(expiresAt) });
  });

  it("renews the existing journal when resuming through /demo, but clears it for an expired visitor", async () => {
    const returning = await enterDemo(await request("/demo", 60));
    const expires = new Date(now + DEMO_TTL_SECONDS * 1000);
    expect(returning.cookies.get(DEMO_COOKIE)?.expires).toEqual(expires);
    expect(returning.cookies.get(DEMO_KITS_COOKIE)).toMatchObject({ value: journal, expires });
    const expired = await enterDemo(await request("/demo", 120));
    expect(expired.cookies.get(DEMO_KITS_COOKIE)).toMatchObject({ value: "", expires: new Date(0) });
  });

  const backgroundRequests: VisitOptions[] = [
    { method: "POST", headers: { "next-action": "action" } },
    { headers: { "next-action": "action" } },
    { headers: { rsc: "1", "next-router-prefetch": "1" } },
    { headers: { rsc: "1", "next-router-segment-prefetch": "/_tree" } },
    { headers: { purpose: "prefetch" } },
    { headers: { rsc: "1" } },
  ];
  it.each(backgroundRequests)("does not renew on background requests (%j)", async (init) => {
    expect((await visit(16, init)).getAll()).toEqual([]);
  });

  it("does not revive an expired visitor", async () => {
    expect((await visit(120)).getAll()).toEqual([]);
  });
});
