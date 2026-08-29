import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { getBrief, saveBrief } from "./briefs";

describe("briefs repo", () => {
  it("saveBrief then getBrief round-trips; one brief per (user, date)", async () => {
    const db = new FakeDb();
    await saveBrief(db, "u1", {
      date: "2026-08-29",
      items: [{ title: "Follow up with Priya", why: "due today", url: null }],
    });
    await saveBrief(db, "u1", {
      date: "2026-08-29",
      items: [{ title: "Regenerated", why: "newer run", url: "https://x.test" }],
    });
    const brief = await getBrief(db, "u1", "2026-08-29");
    expect(brief?.items).toHaveLength(1);
    expect(brief?.items[0]?.title).toBe("Regenerated");
    expect(await getBrief(db, "u1", "2026-08-30")).toBeNull();
  });
});
