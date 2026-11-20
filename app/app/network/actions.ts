"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { addContact, editContact, logConversation } from "@/lib/services/network";
import type { ContactForm } from "@/lib/networking/contacts";

/** The Network tab's writes (ROADMAP N1). Rules only: nothing here calls a model. */

async function ws() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

const field = (f: FormData, k: string) => String(f.get(k) ?? "");

function refresh() {
  revalidatePath("/app/network");
  revalidatePath("/app");
  revalidatePath("/app/home");
  revalidatePath("/app/watchlist");
}

export interface AddContactState {
  error: string;
  /** What was typed, so the form shows it again: React clears a form after its action. */
  values: ContactForm;
}

/** Returns an error to show on the form, or redirects to the contact's row. */
export async function addContactAction(_prev: AddContactState | null, form: FormData): Promise<AddContactState | null> {
  const { db, userId } = await ws();
  const values: ContactForm = {
    name: field(form, "name"),
    linkedin: field(form, "linkedin"),
    company: field(form, "company"),
    role: field(form, "role"),
    warmth: field(form, "warmth"),
    how: field(form, "how"),
  };
  const r = await addContact(db, userId, values);
  if ("error" in r) return { error: r.error, values };
  refresh();
  redirect(`/app/network?${r.created ? "added" : "found"}=${encodeURIComponent(r.contact.id)}#contact-${encodeURIComponent(r.contact.id)}`);
}

export async function logConversationAction(contactId: string, form: FormData): Promise<void> {
  const { db, userId } = await ws();
  const followup = field(form, "followup");
  await logConversation(
    db,
    userId,
    contactId,
    { date: field(form, "date"), channel: field(form, "channel"), summary: field(form, "summary") },
    followup ? followup : undefined,
  );
  refresh();
  redirect(`/app/network?logged=${encodeURIComponent(contactId)}#contact-${encodeURIComponent(contactId)}`);
}

export async function editContactAction(contactId: string, form: FormData): Promise<void> {
  const { db, userId } = await ws();
  await editContact(db, userId, contactId, {
    warmth: field(form, "warmth"),
    status: field(form, "status"),
    nextFollowup: field(form, "followup") || null,
  });
  refresh();
  redirect(`/app/network#contact-${encodeURIComponent(contactId)}`);
}
