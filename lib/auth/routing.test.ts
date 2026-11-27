import { describe, it, expect } from "vitest";
import { APP_HOME, safeNextPath, signedInRedirect } from "./routing";

describe("signedInRedirect", () => {
  it("sends a signed-in visitor from the landing or sign-in page straight to the overview", () => {
    expect(APP_HOME).toBe("/app/home");
    expect(signedInRedirect("/", true)).toBe("/app/home");
    expect(signedInRedirect("/signin", true)).toBe("/app/home");
  });

  it("leaves signed-out visitors, and every other page, where they are", () => {
    expect(signedInRedirect("/", false)).toBeNull();
    expect(signedInRedirect("/signin", false)).toBeNull();
    expect(signedInRedirect("/app/bank", true)).toBeNull();
    expect(signedInRedirect("/auth/callback", true)).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("keeps a same-site path, with its query and hash", () => {
    expect(safeNextPath("/app/bank")).toBe("/app/bank");
    expect(safeNextPath("/app/interview?prep=acme#top")).toBe("/app/interview?prep=acme#top");
  });

  it("falls back to the overview when next is missing or empty", () => {
    expect(safeNextPath(null)).toBe(APP_HOME);
    expect(safeNextPath(undefined)).toBe(APP_HOME);
    expect(safeNextPath("")).toBe(APP_HOME);
  });

  it("never sends the browser to another site", () => {
    for (const next of [
      "//evil.example",
      "///evil.example",
      "https://evil.example",
      "http:evil.example",
      "javascript:alert(1)",
      "/\\evil.example",
      "/\\/evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "app/bank",
      "evil.example",
    ]) {
      expect(safeNextPath(next), next).toBe(APP_HOME);
    }
  });
});
