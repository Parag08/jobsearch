import { advance } from "../pipeline";
import { norm, type Application, type ClosedReason, type Contact, type Interaction, type Stage, type Warmth } from "../types";
import type { DbClient } from "../repos/db";
import {
  findApplicationByExternalRef,
  getApplication,
  insertApplication,
  listApplications,
  setSyncFields,
  updateApplication,
} from "../repos/applications";
import {
  addInteraction,
  findContactByExternalRef,
  getContact,
  insertContact,
  listContacts,
  listInteractions,
  setContactExternalRef,
  updateContact,
} from "../repos/contacts";
import { markApplied } from "./mark-applied";

/**
 * What an agent may do to a user's pipeline and contacts (the MCP tools in lib/mcp call
 * these and nothing else). Three rules hold here rather than in the caller:
 *  - upserts are idempotent: the same externalRef always lands on the same row, and a
 *    record made by hand in the app is adopted (matched on company + role, or name +
 *    company) instead of duplicated;
 *  - an upsert never moves a stage. Stages move only through setStage, which demands
 *    the date and the evidence, so a prepared CV can never read as a sent application;
 *  - `applied` goes through markApplied, so the sent CV freezes exactly as it does in the app.
 */

export interface AgentDeps {
  db: DbClient;
}

export interface ApplicationInput {
  externalRef?: string;
  company: string;
  role: string;
  jdRaw?: string | null;
  applyUrl?: string | null;
  nextAction?: string | null;
  /** ISO date the record was first saved; only used when the row is created. */
  savedAt?: string;
}

export interface UpsertResult<T> {
  record: T;
  created: boolean;
}

export async function upsertApplication(
  { db }: AgentDeps,
  userId: string,
  input: ApplicationInput,
  today: string,
): Promise<UpsertResult<Application>> {
  let existing = input.externalRef ? await findApplicationByExternalRef(db, userId, input.externalRef) : null;
  if (!existing) {
    // Adopt a row the user made by hand (or the seed made) for the same posting.
    const same = (await listApplications(db, userId)).filter(
      (a) => !a.externalRef && norm(a.company) === norm(input.company) && norm(a.role) === norm(input.role),
    );
    existing = same[0] ?? null;
  }

  const sync = {
    ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
    ...(input.applyUrl !== undefined ? { applyUrl: input.applyUrl } : {}),
    ...(input.jdRaw !== undefined ? { jdRaw: input.jdRaw } : {}),
  };

  if (existing) {
    let record = existing;
    const changed =
      existing.company !== input.company ||
      existing.role !== input.role ||
      (input.nextAction !== undefined && existing.nextAction !== input.nextAction);
    if (changed) {
      record = await updateApplication(db, userId, {
        ...existing,
        company: input.company,
        role: input.role,
        nextAction: input.nextAction !== undefined ? input.nextAction : existing.nextAction,
        updatedAt: today,
      });
    }
    if (Object.keys(sync).length) record = await setSyncFields(db, userId, existing.id, sync);
    return { record, created: false };
  }

  const inserted = await insertApplication(
    db,
    userId,
    {
      company: input.company,
      role: input.role,
      sectorId: null,
      stage: "saved",
      closedReason: null,
      jdExtract: null,
      cvVersionId: null,
      referralContactId: null,
      nextAction: input.nextAction ?? null,
      savedAt: input.savedAt ?? today,
      appliedAt: null,
      updatedAt: today,
    },
    input.jdRaw ?? null,
  );
  const record = Object.keys(sync).length ? await setSyncFields(db, userId, inserted.id, sync) : inserted;
  return { record, created: true };
}

export interface ApplicationRef {
  id?: string;
  externalRef?: string;
}

export async function findApplication({ db }: AgentDeps, userId: string, ref: ApplicationRef): Promise<Application> {
  const app = ref.id
    ? await getApplication(db, userId, ref.id)
    : ref.externalRef
      ? await findApplicationByExternalRef(db, userId, ref.externalRef)
      : null;
  if (!app) throw new Error(`No application found for ${JSON.stringify(ref)}`);
  return app;
}

export interface SetStageInput extends ApplicationRef {
  stage: Stage;
  /** ISO date the event happened (not the date it was recorded). */
  date: string;
  /** Where this is known from: "confirmed by the user 2026-11-04", "Gmail receipt 2026-11-03". */
  evidence: string;
  closedReason?: ClosedReason;
}

export interface SetStageResult {
  application: Application;
  /** False when the application was already in that stage (nothing written but the note). */
  moved: boolean;
}

export async function setStage(deps: AgentDeps, userId: string, input: SetStageInput): Promise<SetStageResult> {
  const { db } = deps;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("date must be an ISO date (YYYY-MM-DD)");
  if (!input.evidence.trim()) throw new Error("evidence is required: say where this stage is known from");

  const app = await findApplication(deps, userId, input);
  const note = `${input.stage} ${input.date}: ${input.evidence.trim()}`;

  if (app.stage === input.stage) {
    return { application: await setSyncFields(db, userId, app.id, { statusNote: note }), moved: false };
  }
  if (input.stage === "applied") {
    await markApplied({ db }, userId, app.id, `${input.date}T00:00:00.000Z`);
  } else {
    await updateApplication(db, userId, advance(app, input.stage, input.date, input.closedReason));
  }
  return { application: await setSyncFields(db, userId, app.id, { statusNote: note }), moved: true };
}

export interface ContactInput {
  externalRef?: string;
  name: string;
  company?: string | null;
  role?: string | null;
  location?: string | null;
  warmth?: Warmth;
  status?: Contact["status"];
  network?: Contact["network"];
  interests?: string[];
  nextFollowup?: string | null;
}

export async function upsertContact(
  { db }: AgentDeps,
  userId: string,
  input: ContactInput,
): Promise<UpsertResult<Contact>> {
  let existing = input.externalRef ? await findContactByExternalRef(db, userId, input.externalRef) : null;
  if (!existing) {
    const same = (await listContacts(db, userId)).filter(
      (c) =>
        !c.externalRef &&
        norm(c.name) === norm(input.name) &&
        (!input.company || !c.company || norm(c.company) === norm(input.company)),
    );
    existing = same[0] ? await getContact(db, userId, same[0].id) : null;
  }

  if (existing) {
    const merged: Contact = {
      ...existing,
      name: input.name,
      company: input.company !== undefined ? input.company : existing.company,
      role: input.role !== undefined ? input.role : existing.role,
      location: input.location !== undefined ? input.location : existing.location,
      warmth: input.warmth ?? existing.warmth,
      status: input.status ?? existing.status,
      network: input.network !== undefined ? input.network : existing.network,
      interests: input.interests ?? existing.interests,
      nextFollowup: input.nextFollowup !== undefined ? input.nextFollowup : existing.nextFollowup,
    };
    const record = await updateContact(db, userId, merged);
    if (input.externalRef && existing.externalRef !== input.externalRef) {
      await setContactExternalRef(db, userId, existing.id, input.externalRef);
    }
    return { record: { ...record, externalRef: input.externalRef ?? existing.externalRef ?? null }, created: false };
  }

  const record = await insertContact(db, userId, {
    name: input.name,
    network: input.network ?? null,
    company: input.company ?? null,
    role: input.role ?? null,
    location: input.location ?? null,
    warmth: input.warmth ?? "cold",
    status: input.status ?? "not-contacted",
    interests: input.interests ?? [],
    nextFollowup: input.nextFollowup ?? null,
  });
  if (input.externalRef) await setContactExternalRef(db, userId, record.id, input.externalRef);
  return { record: { ...record, externalRef: input.externalRef ?? null }, created: true };
}

export interface ContactRef {
  id?: string;
  externalRef?: string;
}

export async function findContact({ db }: AgentDeps, userId: string, ref: ContactRef): Promise<Contact> {
  const c = ref.id
    ? await getContact(db, userId, ref.id)
    : ref.externalRef
      ? await findContactByExternalRef(db, userId, ref.externalRef)
      : null;
  if (!c) throw new Error(`No contact found for ${JSON.stringify(ref)}`);
  return c;
}

/** Log one interaction. The same date + channel + summary is recorded once, so a re-run sync adds nothing. */
export async function logInteraction(
  deps: AgentDeps,
  userId: string,
  ref: ContactRef,
  interaction: Interaction,
): Promise<{ interaction: Interaction; created: boolean }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(interaction.date)) throw new Error("date must be an ISO date (YYYY-MM-DD)");
  const contact = await findContact(deps, userId, ref);
  const existing = await listInteractions(deps.db, userId, contact.id);
  const dup = existing.find(
    (i) => i.date === interaction.date && i.channel === interaction.channel && norm(i.summary) === norm(interaction.summary),
  );
  if (dup) return { interaction: dup, created: false };
  return { interaction: await addInteraction(deps.db, userId, contact.id, interaction), created: true };
}
