import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { getWorkspace } from "./index";

vi.mock("server-only", () => ({}));
const { getCookie } = vi.hoisted(() => ({ getCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie }) }));

const missingSupabase = /NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/;

beforeEach(() => {
  getCookie.mockReset();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
  vi.stubEnv("LOCAL_DEMO_MODE", undefined);
  vi.stubEnv("DEMO_MAX_VISITORS", undefined);
});

afterEach(() => vi.unstubAllEnvs());

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
    getCookie.mockReturnValue({ value: "00000000-0000-0000-0000-000000000001" });
    await expect(getWorkspace()).resolves.toMatchObject({
      db: expect.any(FakeDb),
      mode: "demo",
      cannedAi: true,
    });
  });
});
