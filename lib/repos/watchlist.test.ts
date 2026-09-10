import { describe, it, expect } from "vitest";
import { newWatchlistEntry } from "../watchlist/types";
import { FakeDb } from "./fake-db";
import {
  addWatchlistEntry,
  listWatchlist,
  removeWatchlistEntry,
  setWatchlistActive,
  toWatchlistEntry,
  watchlistRow,
} from "./watchlist";

const TODAY = "2026-09-10";
const acme = newWatchlistEntry("Acme Corp", "https://boards.greenhouse.io/acmecorp", TODAY);
const beta = newWatchlistEntry("Beta Labs", "https://jobs.lever.co/beta-labs", TODAY);

describe("watchlist repo", () => {
  it("addWatchlistEntry inserts and returns the DB identity with derived ats/token", async () => {
    const db = new FakeDb();
    const saved = await addWatchlistEntry(db, "u1", acme);
    expect(saved.id).toMatch(/^fake-id-/);
    expect(saved).toMatchObject({ company: "Acme Corp", ats: "greenhouse", token: "acmecorp", active: true });
    expect(db.rows("watchlist")[0]).toMatchObject({ user_id: "u1", careers_url: acme.careersUrl });
  });

  it("addWatchlistEntry upserts on (user, careers_url): re-adding the same board keeps one row", async () => {
    const db = new FakeDb();
    await addWatchlistEntry(db, "u1", acme);
    await addWatchlistEntry(db, "u1", { ...acme, company: "Acme Corporation" });
    const all = await listWatchlist(db, "u1");
    expect(all).toHaveLength(1);
    expect(all[0]?.company).toBe("Acme Corporation");
  });

  it("listWatchlist filters by user and optionally by active, ordered by company", async () => {
    const db = new FakeDb();
    await addWatchlistEntry(db, "u1", beta);
    await addWatchlistEntry(db, "u1", acme);
    await addWatchlistEntry(db, "u2", acme);
    expect((await listWatchlist(db, "u1")).map((w) => w.company)).toEqual(["Acme Corp", "Beta Labs"]);
    expect(await listWatchlist(db, "u3")).toEqual([]);

    const [a] = await listWatchlist(db, "u1");
    await setWatchlistActive(db, "u1", a!.id, false);
    expect((await listWatchlist(db, "u1", { active: true })).map((w) => w.company)).toEqual(["Beta Labs"]);
    expect((await listWatchlist(db, "u1", { active: false })).map((w) => w.company)).toEqual(["Acme Corp"]);
  });

  it("setWatchlistActive is scoped to the user (another user's id is not found)", async () => {
    const db = new FakeDb();
    const saved = await addWatchlistEntry(db, "u1", acme);
    await expect(setWatchlistActive(db, "u2", saved.id, false)).rejects.toThrow(/watchlist\.setActive/);
  });

  it("removeWatchlistEntry deletes only that user's row", async () => {
    const db = new FakeDb();
    const mine = await addWatchlistEntry(db, "u1", acme);
    await addWatchlistEntry(db, "u2", acme);
    await removeWatchlistEntry(db, "u1", mine.id);
    expect(await listWatchlist(db, "u1")).toEqual([]);
    expect(await listWatchlist(db, "u2")).toHaveLength(1);
  });

  it("row mappers round-trip (snake <-> camel) and zod-validate at the boundary", () => {
    const row = { id: "w1", ...watchlistRow("u1", acme) };
    expect(row).toMatchObject({ user_id: "u1", careers_url: acme.careersUrl, added_at: TODAY });
    expect(toWatchlistEntry(row)).toEqual({ id: "w1", ...acme });
    expect(() => toWatchlistEntry({ ...row, ats: "workday" as never })).toThrow();
  });
});
