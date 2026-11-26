import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../../middleware";
import { DEMO_COOKIE, DEMO_TTL_SECONDS } from "./visitors";
import { demoVisitorToken, readDemoVisitor } from "./visitor-token";

vi.mock("../db/supabase", () => ({ requireWorkspaceEnv: () => null }));

const id = "00000000-0000-4000-8000-000000000001";
const secret = "demo-lease-test-secret";
const now = Date.UTC(2026, 0, 1);

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

async function visit(ageMinutes: number, init: VisitOptions = {}) {
  const token = await demoVisitorToken(id, secret, now - ageMinutes * 60_000);
  const request = new NextRequest("http://localhost/app/watchlist", {
    ...init,
    headers: { cookie: DEMO_COOKIE + "=" + token, ...init.headers },
  });
  return (await middleware(request)).cookies.get(DEMO_COOKIE)?.value;
}

describe("demo visitor lease renewal", () => {
  it("leaves a recently renewed visitor cookie alone", async () => {
    expect(await visit(10)).toBeUndefined();
  });

  it("renews an older lease on a workspace navigation, including actual RSC navigations", async () => {
    const renewed = await visit(16, { headers: { rsc: "1", "next-router-state-tree": "tree" } });
    await expect(readDemoVisitor(renewed, secret, now)).resolves.toEqual({
      id, expiresAt: now + DEMO_TTL_SECONDS * 1000,
    });
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
    expect(await visit(16, init)).toBeUndefined();
  });

  it("does not revive an expired visitor", async () => {
    expect(await visit(120)).toBeUndefined();
  });
});
