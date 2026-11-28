import { describe, it, expect } from "vitest";
import type { Contact } from "../types";
import { FakeDb } from "./fake-db";
import { LIST_LIMIT } from "./db";
import {
  addInteraction,
  getContact,
  insertContact,
  listContacts,
  listContactsWithInteractions,
  listInteractionDates,
  updateContact,
} from "./contacts";

const newContact = {
  name: "Priya",
  network: { name: "INSEAD", class: "MBA 22J", campus: "Singapore" },
  company: "Grab",
  role: "PM Director",
  location: "Singapore",
  warmth: "warm" as const,
  status: "not-contacted" as const,
  interests: ["ai"],
  nextFollowup: null,
};

describe("contacts repo", () => {
  it("includes later pages in the ordered contact and network lists", async () => {
    const db = new FakeDb();
    const first = await insertContact(db, "u1", { ...newContact, name: "A" });
    for (let i = 1; i < LIST_LIMIT; i++) {
      await insertContact(db, "u1", { ...newContact, name: `A ${i}` });
    }
    const last = await insertContact(db, "u1", { ...newContact, name: "Zoe" });
    await db.from("interactions").insert(Array.from({ length: LIST_LIMIT }, (_, i) => ({
      contact_id: first.id, user_id: "u1", date: "2026-11-17", channel: "email", summary: `recent ${i}`,
    })));
    await addInteraction(db, "u1", last.id, { date: "2026-10-01", channel: "email", summary: "Earlier contact" });
    expect((await listContacts(db, "u1")).at(-1)?.id).toBe(last.id);
    expect((await listContactsWithInteractions(db, "u1")).at(-1)).toMatchObject({
      id: last.id, interactions: [{ summary: "Earlier contact" }],
    });
    await addInteraction(db, "u1", first.id, { date: "2026-09-01", channel: "call", summary: "Earlier call" });
    expect((await getContact(db, "u1", first.id))?.interactions.at(-1)?.summary).toBe("Earlier call");
    expect(await listInteractionDates(db, "u1")).toHaveLength(LIST_LIMIT + 2);
  });

  it("insertContact returns a Contact with empty interactions", async () => {
    const db = new FakeDb();
    const c = await insertContact(db, "u1", newContact);
    expect(c.id).toBeTruthy();
    expect(c.interactions).toEqual([]);
    expect(c.network?.name).toBe("INSEAD");
  });

  it("getContact composes interactions newest-first (raw notes stay in the DB)", async () => {
    const db = new FakeDb();
    const c = await insertContact(db, "u1", newContact);
    await addInteraction(db, "u1", c.id, { date: "2026-08-01", channel: "linkedin", summary: "intro" }, "long raw note");
    await addInteraction(db, "u1", c.id, { date: "2026-08-20", channel: "coffee", summary: "met up" });
    const full = await getContact(db, "u1", c.id);
    expect(full?.interactions.map((i) => i.date)).toEqual(["2026-08-20", "2026-08-01"]);
    expect(full?.interactions[0]).not.toHaveProperty("raw_text");
    expect(await getContact(db, "u1", "missing")).toBeNull();
  });

  it("updateContact persists warmth/status/followup changes", async () => {
    const db = new FakeDb();
    const c = await insertContact(db, "u1", newContact);
    const changed: Contact = { ...c, warmth: "hot", status: "in-conversation", nextFollowup: "2026-09-01" };
    await updateContact(db, "u1", changed);
    const reread = await getContact(db, "u1", c.id);
    expect(reread?.warmth).toBe("hot");
    expect(reread?.status).toBe("in-conversation");
    expect(reread?.nextFollowup).toBe("2026-09-01");
  });

  it("listContacts returns only the user's contacts", async () => {
    const db = new FakeDb();
    await insertContact(db, "u1", newContact);
    await insertContact(db, "u2", { ...newContact, name: "Someone Else" });
    const contacts = await listContacts(db, "u1");
    expect(contacts.map((c) => c.name)).toEqual(["Priya"]);
  });

  it("listInteractionDates gives every outreach date for the user, and only theirs", async () => {
    const db = new FakeDb();
    const mine = await insertContact(db, "u1", newContact);
    const theirs = await insertContact(db, "u2", newContact);
    await addInteraction(db, "u1", mine.id, { date: "2026-11-10", channel: "email", summary: "hi" });
    await addInteraction(db, "u1", mine.id, { date: "2026-11-17", channel: "call", summary: "call" });
    await addInteraction(db, "u2", theirs.id, { date: "2026-11-18", channel: "email", summary: "x" });
    expect((await listInteractionDates(db, "u1")).sort()).toEqual(["2026-11-10", "2026-11-17"]);
  });
});
