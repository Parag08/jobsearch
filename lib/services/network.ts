import { addInteraction, getContact, insertContact, listContacts, updateContact } from "../repos/contacts";
import type { DbClient } from "../repos/db";
import { afterInteraction, contactFromForm, type ContactForm } from "../networking/contacts";
import { ContactSchema, InteractionSchema, norm, WarmthSchema, type Contact } from "../types";

/**
 * Writes behind the Network tab (ROADMAP N1). Rules only, no model calls. The MCP tools keep
 * their own path (lib/services/agent-sync.ts); both land in the same tables.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Add a contact, or find them again: the same LinkedIn link, or the same name at the same firm. */
export async function addContact(
  db: DbClient,
  userId: string,
  f: ContactForm,
): Promise<{ contact: Contact; created: boolean } | { error: string }> {
  const parsed = contactFromForm(f);
  if ("error" in parsed) return parsed;
  const c = parsed.contact;
  const same = (await listContacts(db, userId)).find(
    (x) =>
      (c.linkedinUrl && x.linkedinUrl === c.linkedinUrl) ||
      (norm(x.name) === norm(c.name) && (!c.company || !x.company || norm(x.company) === norm(c.company))),
  );
  if (same) return { contact: same, created: false };
  return { contact: await insertContact(db, userId, c), created: true };
}

async function mustGet(db: DbClient, userId: string, id: string): Promise<Contact> {
  const c = await getContact(db, userId, id);
  if (!c) throw new Error(`contact ${id} not found`);
  return c;
}

/**
 * Log one conversation. The next follow-up is set from the warmth unless `chosenFollowup` is
 * given (`null` clears it); see afterInteraction.
 */
export async function logConversation(
  db: DbClient,
  userId: string,
  contactId: string,
  input: { date: string; channel: string; summary: string },
  chosenFollowup?: string | null,
): Promise<Contact> {
  if (!ISO.test(input.date)) throw new Error("date must be YYYY-MM-DD");
  if (!input.summary.trim()) throw new Error("Say in a line what was said.");
  if (chosenFollowup && !ISO.test(chosenFollowup)) throw new Error("follow-up date must be YYYY-MM-DD");
  const interaction = InteractionSchema.parse({ ...input, summary: input.summary.trim() });
  const contact = await mustGet(db, userId, contactId);
  const next = afterInteraction(contact, interaction, chosenFollowup);
  await addInteraction(db, userId, contact.id, interaction);
  return updateContact(db, userId, { ...contact, ...next, interactions: [interaction, ...contact.interactions] });
}

/** Change warmth, status or the follow-up date; fields left out keep their value. */
export async function editContact(
  db: DbClient,
  userId: string,
  contactId: string,
  patch: { warmth?: string; status?: string; nextFollowup?: string | null },
): Promise<Contact> {
  if (patch.nextFollowup && !ISO.test(patch.nextFollowup)) throw new Error("follow-up date must be YYYY-MM-DD");
  const contact = await mustGet(db, userId, contactId);
  return updateContact(db, userId, {
    ...contact,
    warmth: patch.warmth !== undefined ? WarmthSchema.parse(patch.warmth) : contact.warmth,
    status: patch.status !== undefined ? ContactSchema.shape.status.parse(patch.status) : contact.status,
    nextFollowup: patch.nextFollowup !== undefined ? patch.nextFollowup : contact.nextFollowup,
  });
}
