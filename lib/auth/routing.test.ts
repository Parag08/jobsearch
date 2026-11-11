import { describe, it, expect } from "vitest";
import { signedInRedirect } from "./routing";

describe("signedInRedirect", () => {
  it("sends a signed-in visitor from the landing or sign-in page straight to the dashboard", () => {
    expect(signedInRedirect("/", true)).toBe("/app");
    expect(signedInRedirect("/signin", true)).toBe("/app");
  });

  it("leaves signed-out visitors, and every other page, where they are", () => {
    expect(signedInRedirect("/", false)).toBeNull();
    expect(signedInRedirect("/signin", false)).toBeNull();
    expect(signedInRedirect("/app/bank", true)).toBeNull();
    expect(signedInRedirect("/auth/callback", true)).toBeNull();
  });
});
