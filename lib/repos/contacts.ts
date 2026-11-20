import type { Contact, Interaction } from "../types";
import { many, one, oneOrNull, RepoError, type DbClient } from "./db";
import { contactPatch, contactRow, interactionRow, toContact, toInteraction } from "./rows";

export type NewContact = Omit<Contact, "id" | "interactions">;

export async function insertContact(db: DbClient, userId: string, c: NewContact): Promise<Contact> {
  const row = await one(
    db.from("contacts").insert(contactRow(userId, c)).select().single(),
    "contacts",
    "insert",
  );
  return toContact(row, []);
}

/** Composes interactions newest-first; raw notes (raw_text) never leave the DB. */
export async function getContact(db: DbClient, userId: string, id: string): Promise<Contact | null> {
  const row = await oneOrNull(
    db.from("contacts").select().eq("user_id", userId).eq("id", id).maybeSingle(),
    "contacts",
    "get",
  );
  if (!row) return null;
  return toContact(row, await listInteractions(db, userId, id));
}

/** The date of every interaction the user logged - what the Overview counts as people reached. */
export async function listInteractionDates(db: DbClient, userId: string): Promise<string[]> {
  const rows = await many(db.from("interactions").select("date").eq("user_id", userId), "interactions", "list dates");
  return rows.map((r) => r.date);
}

/** Contacts without their interaction logs - load one via getContact when composing messages. */
export async function listContacts(db: DbClient, userId: string): Promise<Contact[]> {
  const rows = await many(db.from("contacts").select().eq("user_id", userId), "contacts", "list");
  return rows.map((r) => toContact(r, []));
}

/** Every contact with their log, newest first: two queries, for the Network tab. */
export async function listContactsWithInteractions(db: DbClient, userId: string): Promise<Contact[]> {
  const [contacts, rows] = await Promise.all([
    many(db.from("contacts").select().eq("user_id", userId), "contacts", "list"),
    many(db.from("interactions").select().eq("user_id", userId).order("date", { ascending: false }), "interactions", "list all"),
  ]);
  const byContact = new Map<string, Interaction[]>();
  for (const r of rows) byContact.set(r.contact_id, [...(byContact.get(r.contact_id) ?? []), toInteraction(r)]);
  return contacts.map((r) => toContact(r, byContact.get(r.id) ?? []));
}

export async function updateContact(db: DbClient, userId: string, c: Contact): Promise<Contact> {
  const row = await one(
    db.from("contacts").update(contactPatch(c)).eq("user_id", userId).eq("id", c.id).select().single(),
    "contacts",
    "update",
  );
  return toContact(row, c.interactions);
}

export async function addInteraction(
  db: DbClient,
  userId: string,
  contactId: string,
  interaction: Interaction,
  rawText: string | null = null,
): Promise<Interaction> {
  const row = await one(
    db.from("interactions").insert(interactionRow(userId, contactId, interaction, rawText)).select().single(),
    "interactions",
    "insert",
  );
  return toInteraction(row);
}

export async function listInteractions(
  db: DbClient,
  userId: string,
  contactId: string,
): Promise<Interaction[]> {
  const rows = await many(
    db
      .from("interactions")
      .select()
      .eq("user_id", userId)
      .eq("contact_id", contactId)
      .order("date", { ascending: false }),
    "interactions",
    "list",
  );
  return rows.map(toInteraction);
}

export async function findContactByExternalRef(
  db: DbClient,
  userId: string,
  externalRef: string,
): Promise<Contact | null> {
  const rows = await many(
    db.from("contacts").select().eq("user_id", userId).eq("external_ref", externalRef).limit(1),
    "contacts",
    "findByExternalRef",
  );
  return rows[0] ? toContact(rows[0], await listInteractions(db, userId, rows[0].id)) : null;
}

export async function setContactExternalRef(
  db: DbClient,
  userId: string,
  id: string,
  externalRef: string,
): Promise<void> {
  await one(
    db.from("contacts").update({ external_ref: externalRef }).eq("user_id", userId).eq("id", id).select().single(),
    "contacts",
    "setExternalRef",
  );
}

/** Correct one logged interaction; it must belong to this user and this contact. */
export async function updateInteraction(
  db: DbClient,
  userId: string,
  contactId: string,
  id: string,
  patch: Partial<Pick<Interaction, "date" | "channel" | "summary">>,
): Promise<Interaction | null> {
  const row = await oneOrNull(
    db.from("interactions").update(patch).eq("user_id", userId).eq("contact_id", contactId).eq("id", id).select().maybeSingle(),
    "interactions",
    "update",
  );
  return row ? toInteraction(row) : null;
}

/** Remove one logged interaction; true when one was removed. */
export async function deleteInteraction(db: DbClient, userId: string, contactId: string, id: string): Promise<boolean> {
  const found = await oneOrNull(
    db.from("interactions").select().eq("user_id", userId).eq("contact_id", contactId).eq("id", id).maybeSingle(),
    "interactions",
    "find",
  );
  if (!found) return false;
  const { error } = await db.from("interactions").delete().eq("user_id", userId).eq("contact_id", contactId).eq("id", id);
  if (error) throw new RepoError("interactions", "delete", error.message);
  return true;
}
