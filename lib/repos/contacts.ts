import type { Contact, Interaction } from "../types";
import { many, one, oneOrNull, type DbClient } from "./db";
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

/** Contacts without their interaction logs - load one via getContact when composing messages. */
export async function listContacts(db: DbClient, userId: string): Promise<Contact[]> {
  const rows = await many(db.from("contacts").select().eq("user_id", userId), "contacts", "list");
  return rows.map((r) => toContact(r, []));
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
