import { describe, it, expect } from "vitest";
import type { Contact } from "../types";
import { FakeDb } from "./fake-db";
import {
  addInteraction,
  getContact,
  insertContact,
  listContacts,
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
});
