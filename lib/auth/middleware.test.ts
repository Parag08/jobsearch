import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../../middleware";
import { demoVisitorToken } from "../demo/visitor-token";
import { DEMO_COOKIE } from "../demo/visitors";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: null } });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  vi.stubEnv("DEMO_MAX_VISITORS", undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("middleware session refresh", () => {
  it.each(["", "other=value", "sb-project-auth-token-code-verifier=pkce"])(
    "skips Supabase on sign-in without a session cookie (%s)",
    async (cookie) => {
      const response = await middleware(new NextRequest("http://localhost/signin", { headers: { cookie } }));

      expect(response.headers.get("location")).toBeNull();
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  it("passes signed-out Settings requests to the workspace guard with the correct return path", async () => {
    const response = await middleware(new NextRequest("http://localhost/app/settings?section=goals", {
      headers: { "x-jobsearch-settings": "/wrong-path" },
    }));

    expect(response.headers.get("x-middleware-request-x-jobsearch-settings")).toBe("/app/settings?section=goals");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it.each(["sb-project-auth-token", "sb-project-auth-token.0"])(
    "uses verified auth before redirecting visitors with %s",
    async (name) => {
      const request = new NextRequest("http://localhost/signin", { headers: { cookie: name + "=session" } });

      expect((await middleware(request)).headers.get("location")).toBeNull();
      expect(getUser).toHaveBeenCalledTimes(1);

      getUser.mockResolvedValueOnce({ data: { user: { id: "user" } } });
      expect((await middleware(request)).headers.get("location")).toBe("http://localhost/app/home");
      expect(getUser).toHaveBeenCalledTimes(2);
    },
  );

  it("still renews signed public-demo leases when Supabase is configured", async () => {
    vi.stubEnv("DEMO_MAX_VISITORS", "10");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
    const token = await demoVisitorToken("00000000-0000-4000-8000-000000000001", "test-secret", Date.now() - 16 * 60_000);
    const response = await middleware(new NextRequest("http://localhost/app", {
      headers: { cookie: DEMO_COOKIE + "=" + token },
    }));

    expect(response.cookies.get(DEMO_COOKIE)?.value).toBeTruthy();
    expect(response.cookies.get(DEMO_COOKIE)?.value).not.toBe(token);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
