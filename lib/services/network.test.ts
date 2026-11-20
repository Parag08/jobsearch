import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { getContact, listContacts, listContactsWithInteractions } from "../repos/contacts";
import { addContact, editContact, logConversation } from "./network";

const U = "u1";
const form = (over: Partial<Record<string, string>> = {}) => ({ name: "Priya Raman", linkedin: "", company: "Kestrel AI", role: "", warmth: "warm", how: "", ...over });

describe("addContact", () => {
  it("adds a contact the user typed, with their LinkedIn link kept as a link", async () => {
    const db = new FakeDb();
    const r = await addContact(db, U, form({ linkedin: "linkedin.com/in/priya-raman-1a2b" }));
    expect("contact" in r && r.created).toBe(true);
    const [c] = await listContacts(db, U);
    expect(c).toMatchObject({ name: "Priya Raman", company: "Kestrel AI", warmth: "warm", linkedinUrl: "https://www.linkedin.com/in/priya-raman-1a2b" });
  });

  it("finds the same person again instead of adding a duplicate", async () => {
    const db = new FakeDb();
    await addContact(db, U, form({ linkedin: "linkedin.com/in/priya-raman-1a2b" }));
    const byLink = await addContact(db, U, form({ name: "P. Raman", company: "", linkedin: "https://www.linkedin.com/in/priya-raman-1a2b/" }));
    const byName = await addContact(db, U, form({ name: "priya raman" }));
    expect("contact" in byLink && byLink.created).toBe(false);
    expect("contact" in byName && byName.created).toBe(false);
    expect(await listContacts(db, U)).toHaveLength(1);
  });

  it("returns the form's error and writes nothing", async () => {
    const db = new FakeDb();
    expect(await addContact(db, U, form({ name: "" }))).toEqual({ error: "Give a name or paste a LinkedIn profile link." });
    expect(await listContacts(db, U)).toHaveLength(0);
  });
});

describe("logConversation", () => {
  it("records the conversation and sets the next follow-up and status", async () => {
    const db = new FakeDb();
    const r = await addContact(db, U, form());
    const id = "contact" in r ? r.contact.id : "";
    await logConversation(db, U, id, { date: "2026-11-20", channel: "linkedin", summary: "Asked for a 15-minute chat." });
    const c = await getContact(db, U, id);
    expect(c?.interactions).toEqual([{ date: "2026-11-20", channel: "linkedin", summary: "Asked for a 15-minute chat." }]);
    expect(c).toMatchObject({ status: "awaiting-reply", nextFollowup: "2026-11-27" });
  });

  it("refuses an empty summary, a bad date or channel, or someone else's contact", async () => {
    const db = new FakeDb();
    const r = await addContact(db, U, form());
    const id = "contact" in r ? r.contact.id : "";
    await expect(logConversation(db, U, id, { date: "2026-11-20", channel: "email", summary: "  " })).rejects.toThrow(/what was said/);
    await expect(logConversation(db, U, id, { date: "20 Nov", channel: "email", summary: "x" })).rejects.toThrow(/date/);
    await expect(logConversation(db, U, id, { date: "2026-11-20", channel: "fax", summary: "x" })).rejects.toThrow();
    await expect(logConversation(db, "other", id, { date: "2026-11-20", channel: "email", summary: "x" })).rejects.toThrow(/not found/);
  });
});

describe("editContact", () => {
  it("changes warmth, status and follow-up, keeping the log and the link", async () => {
    const db = new FakeDb();
    const r = await addContact(db, U, form({ linkedin: "linkedin.com/in/priya-raman" }));
    const id = "contact" in r ? r.contact.id : "";
    await logConversation(db, U, id, { date: "2026-11-20", channel: "coffee", summary: "Coffee." });
    await editContact(db, U, id, { warmth: "hot", status: "in-conversation", nextFollowup: null });
    const c = await getContact(db, U, id);
    expect(c).toMatchObject({ warmth: "hot", status: "in-conversation", nextFollowup: null, linkedinUrl: "https://www.linkedin.com/in/priya-raman" });
    expect(c?.interactions).toHaveLength(1);
  });
});

describe("listContactsWithInteractions", () => {
  it("returns each contact with only their own log, newest first", async () => {
    const db = new FakeDb();
    const a = await addContact(db, U, form());
    const b = await addContact(db, U, form({ name: "Tan Wei Ming", company: "Atlas" }));
    const ida = "contact" in a ? a.contact.id : "";
    const idb = "contact" in b ? b.contact.id : "";
    await logConversation(db, U, ida, { date: "2026-11-01", channel: "email", summary: "first" });
    await logConversation(db, U, ida, { date: "2026-11-10", channel: "call", summary: "second" });
    await logConversation(db, U, idb, { date: "2026-11-05", channel: "email", summary: "other" });
    const all = await listContactsWithInteractions(db, U);
    expect(all.find((c) => c.id === ida)?.interactions.map((i) => i.summary)).toEqual(["second", "first"]);
    expect(all.find((c) => c.id === idb)?.interactions.map((i) => i.summary)).toEqual(["other"]);
    expect(await listContactsWithInteractions(db, "someone-else")).toEqual([]);
  });
});
