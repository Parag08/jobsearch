import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";

/** The fake must mirror supabase-js semantics - repos are tested against it. */
describe("FakeDb", () => {
  it("insert().select().single() returns the stored row with a generated id", async () => {
    const db = new FakeDb();
    const { data, error } = await db
      .from("briefs")
      .insert({ user_id: "u1", date: "2026-08-29", items: [] })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.date).toBe("2026-08-29");
  });

  it("select().eq() filters; other users' rows stay invisible", async () => {
    const db = new FakeDb();
    await db.from("briefs").insert([
      { user_id: "u1", date: "2026-08-29", items: [] },
      { user_id: "u2", date: "2026-08-29", items: [] },
    ]);
    const { data } = await db.from("briefs").select().eq("user_id", "u1");
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe("u1");
  });

  it("eq() matches array values structurally (postgres array equality)", async () => {
    const db = new FakeDb();
    await db.from("sectors").insert({
      user_id: "u1",
      path: ["IT", "AI", "Singapore"],
      skills: {},
      companies: [],
      titles: [],
      jd_count: 0,
      summary: "",
    });
    const { data } = await db
      .from("sectors")
      .select()
      .eq("user_id", "u1")
      .eq("path", ["IT", "AI", "Singapore"]);
    expect(data).toHaveLength(1);
  });

  it("order() and limit() shape the result", async () => {
    const db = new FakeDb();
    await db.from("sourced_jobs").insert([
      { user_id: "u1", source: "adzuna", external_id: "a", title: "A", company: "", location: null, url: null, posted_at: null, score: 10, status: "new" },
      { user_id: "u1", source: "adzuna", external_id: "b", title: "B", company: "", location: null, url: null, posted_at: null, score: 90, status: "new" },
      { user_id: "u1", source: "adzuna", external_id: "c", title: "C", company: "", location: null, url: null, posted_at: null, score: 50, status: "new" },
    ]);
    const { data } = await db
      .from("sourced_jobs")
      .select()
      .eq("user_id", "u1")
      .order("score", { ascending: false })
      .limit(2);
    expect(data?.map((r) => r.score)).toEqual([90, 50]);
  });

  it("single() errors when zero rows match; maybeSingle() returns null", async () => {
    const db = new FakeDb();
    const single = await db.from("briefs").select().eq("id", "nope").single();
    expect(single.error).not.toBeNull();
    const maybe = await db.from("briefs").select().eq("id", "nope").maybeSingle();
    expect(maybe.error).toBeNull();
    expect(maybe.data).toBeNull();
  });

  it("update().eq().select() patches matching rows and persists the change", async () => {
    const db = new FakeDb();
    const { data: inserted } = await db
      .from("briefs")
      .insert({ user_id: "u1", date: "2026-08-29", items: [] })
      .select()
      .single();
    const { data: updated } = await db
      .from("briefs")
      .update({ items: [{ title: "t", why: "w", url: null }] })
      .eq("id", inserted!.id)
      .select()
      .single();
    expect(updated?.items).toHaveLength(1);
    const { data: reread } = await db.from("briefs").select().eq("id", inserted!.id).single();
    expect(reread?.items).toHaveLength(1);
  });

  it("upsert() with onConflict updates the existing row instead of duplicating", async () => {
    const db = new FakeDb();
    await db
      .from("briefs")
      .upsert({ user_id: "u1", date: "2026-08-29", items: [] }, { onConflict: "user_id,date" });
    await db
      .from("briefs")
      .upsert(
        { user_id: "u1", date: "2026-08-29", items: [{ title: "t", why: "w", url: null }] },
        { onConflict: "user_id,date" },
      );
    const { data } = await db.from("briefs").select().eq("user_id", "u1");
    expect(data).toHaveLength(1);
    expect(data?.[0]?.items).toHaveLength(1);
  });

  it("upsert() with a null conflict-column value inserts (nulls are distinct, like SQL)", async () => {
    const db = new FakeDb();
    const row = { user_id: "u1", source: "manual", external_id: null, title: "X", company: "", location: null, url: null, posted_at: null, score: null, status: "new" as const };
    await db.from("sourced_jobs").upsert(row, { onConflict: "user_id,source,external_id" });
    await db.from("sourced_jobs").upsert(row, { onConflict: "user_id,source,external_id" });
    const { data } = await db.from("sourced_jobs").select().eq("user_id", "u1");
    expect(data).toHaveLength(2);
  });

  it("delete().eq() removes matching rows", async () => {
    const db = new FakeDb();
    const { data: inserted } = await db
      .from("briefs")
      .insert({ user_id: "u1", date: "2026-08-29", items: [] })
      .select()
      .single();
    await db.from("briefs").delete().eq("id", inserted!.id);
    const { data } = await db.from("briefs").select().eq("user_id", "u1");
    expect(data).toHaveLength(0);
  });

  it("in() filters by a value list", async () => {
    const db = new FakeDb();
    await db.from("bullets").insert([
      { user_id: "u1", project_id: "p1", role_family: "pm", text: "a", skills: [] },
      { user_id: "u1", project_id: "p1", role_family: "pm", text: "b", skills: [] },
    ]);
    const { data: all } = await db.from("bullets").select().eq("user_id", "u1");
    const ids = [all![0]!.id];
    const { data } = await db.from("bullets").select().in("id", ids);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.text).toBe("a");
  });

  it("returned rows are detached copies - mutating them does not change the store", async () => {
    const db = new FakeDb();
    const { data } = await db
      .from("briefs")
      .insert({ user_id: "u1", date: "2026-08-29", items: [] })
      .select()
      .single();
    data!.items.push({ title: "sneaky", why: "", url: null });
    const { data: reread } = await db.from("briefs").select().eq("id", data!.id).single();
    expect(reread?.items).toHaveLength(0);
  });
});
