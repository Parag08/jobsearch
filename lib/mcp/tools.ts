import { z } from "zod";
import { funnelStats, staleApplications } from "../pipeline";
import { ClosedReasonSchema, InteractionSchema, StageSchema, WarmthSchema, ContactSchema, type Application } from "../types";
import type { DbClient } from "../repos/db";
import { getJdRaw, listApplications } from "../repos/applications";
import { listContacts } from "../repos/contacts";
import {
  findApplication,
  findContact,
  logInteraction,
  setStage,
  upsertApplication,
  upsertContact,
} from "../services/agent-sync";

/** Who is calling and when - resolved from the bearer token by the route, never from tool input. */
export interface ToolContext {
  db: DbClient;
  userId: string;
  nowIso: string;
}

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema, as MCP clients read it. Kept beside the zod schema that actually validates. */
  inputSchema: Record<string, unknown>;
  run(ctx: ToolContext, args: unknown): Promise<unknown>;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD");
const str = { type: "string" } as const;
const dateProp = { type: "string", description: "ISO date YYYY-MM-DD" } as const;
const refProps = {
  id: { type: "string", description: "The record's id in JobSearch" },
  externalRef: { type: "string", description: "The record's id in the system it was imported from" },
} as const;

const RefSchema = z
  .object({ id: z.string().min(1).optional(), externalRef: z.string().min(1).optional() })
  .refine((r) => r.id || r.externalRef, "give id or externalRef");

/** Compact row for lists: ids and state, never the JD (token rule: prompts carry summaries). */
function brief(a: Application) {
  return {
    id: a.id,
    externalRef: a.externalRef ?? null,
    company: a.company,
    role: a.role,
    stage: a.stage,
    closedReason: a.closedReason,
    savedAt: a.savedAt,
    appliedAt: a.appliedAt,
    nextAction: a.nextAction,
    statusNote: a.statusNote ?? null,
    applyUrl: a.applyUrl ?? null,
  };
}

const UpsertApplicationSchema = z.object({
  externalRef: z.string().min(1).optional(),
  company: z.string().min(1),
  role: z.string().min(1),
  jdRaw: z.string().nullable().optional(),
  applyUrl: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  savedAt: isoDate.optional(),
});

const SetStageSchema = z
  .object({
    id: z.string().min(1).optional(),
    externalRef: z.string().min(1).optional(),
    stage: StageSchema,
    date: isoDate,
    evidence: z.string().min(1),
    closedReason: ClosedReasonSchema.optional(),
  })
  .refine((r) => r.id || r.externalRef, "give id or externalRef");

const UpsertContactSchema = z.object({
  externalRef: z.string().min(1).optional(),
  name: z.string().min(1),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  warmth: WarmthSchema.optional(),
  status: ContactSchema.shape.status.optional(),
  network: ContactSchema.shape.network.optional(),
  interests: z.array(z.string()).optional(),
  nextFollowup: isoDate.nullable().optional(),
});

const LogInteractionSchema = z
  .object({
    id: z.string().min(1).optional(),
    externalRef: z.string().min(1).optional(),
    date: isoDate,
    channel: InteractionSchema.shape.channel,
    summary: z.string().min(1),
  })
  .refine((r) => r.id || r.externalRef, "give id or externalRef");

export const TOOLS: Tool[] = [
  {
    name: "pipeline_summary",
    description:
      "Counts of the user's applications by stage, how many were ever applied to, the response rate, and the applications that have sat in 'applied' for 14+ days. Start here.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run({ db, userId, nowIso }) {
      const apps = await listApplications(db, userId);
      return {
        total: apps.length,
        ...funnelStats(apps),
        stale: staleApplications(apps, nowIso.slice(0, 10)).map(brief),
      };
    },
  },
  {
    name: "list_applications",
    description:
      "List the user's applications (compact: no JD text), newest change first. Filter by stage and/or a company substring.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string", enum: StageSchema.options },
        company: { type: "string", description: "Case-insensitive substring of the company name" },
      },
      additionalProperties: false,
    },
    async run({ db, userId }, args) {
      const f = z.object({ stage: StageSchema.optional(), company: z.string().optional() }).parse(args ?? {});
      const needle = f.company?.toLowerCase();
      const apps = (await listApplications(db, userId)).filter(
        (a) => (!f.stage || a.stage === f.stage) && (!needle || a.company.toLowerCase().includes(needle)),
      );
      return { count: apps.length, applications: apps.map(brief) };
    },
  },
  {
    name: "get_application",
    description: "One application in full, including the stored JD text and extract. Give id or externalRef.",
    inputSchema: { type: "object", properties: refProps, additionalProperties: false },
    async run({ db, userId }, args) {
      const app = await findApplication({ db }, userId, RefSchema.parse(args));
      return { ...brief(app), jdExtract: app.jdExtract, jdRaw: await getJdRaw(db, userId, app.id) };
    },
  },
  {
    name: "upsert_application",
    description:
      "Create or update an application record. Idempotent on externalRef; a record made by hand for the same company and role is adopted, not duplicated. New records start in 'saved'. This NEVER changes the stage - a prepared CV is not a submitted application; use set_stage for that.",
    inputSchema: {
      type: "object",
      properties: {
        externalRef: refProps.externalRef,
        company: str,
        role: str,
        jdRaw: { type: ["string", "null"], description: "The posting text, from the company's own portal" },
        applyUrl: { type: ["string", "null"] },
        nextAction: { type: ["string", "null"] },
        savedAt: { ...dateProp, description: "ISO date first saved; used only on creation" },
      },
      required: ["company", "role"],
      additionalProperties: false,
    },
    async run({ db, userId, nowIso }, args) {
      const r = await upsertApplication({ db }, userId, UpsertApplicationSchema.parse(args), nowIso.slice(0, 10));
      return { created: r.created, application: brief(r.record) };
    },
  },
  {
    name: "set_stage",
    description:
      "Move an application to a stage (saved, applied, screening, interview, case, offer, negotiation, closed). Requires the ISO date the event happened and the evidence for it (for example 'confirmed by the user 2026-11-04' or 'Gmail receipt 2026-11-03'). Never infer a stage: without evidence, do not call this. 'applied' freezes the sent CV; 'closed' needs closedReason (won, lost, withdrawn, ghosted) and is final. Calling it for the stage the application is already in changes nothing.",
    inputSchema: {
      type: "object",
      properties: {
        ...refProps,
        stage: { type: "string", enum: StageSchema.options },
        date: dateProp,
        evidence: { type: "string", description: "Where this is known from" },
        closedReason: { type: "string", enum: ClosedReasonSchema.options },
      },
      required: ["stage", "date", "evidence"],
      additionalProperties: false,
    },
    async run({ db, userId }, args) {
      const r = await setStage({ db }, userId, SetStageSchema.parse(args));
      return { moved: r.moved, application: brief(r.application) };
    },
  },
  {
    name: "list_contacts",
    description: "List the user's networking contacts (without interaction logs). Filter by a company substring.",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string", description: "Case-insensitive substring" } },
      additionalProperties: false,
    },
    async run({ db, userId }, args) {
      const f = z.object({ company: z.string().optional() }).parse(args ?? {});
      const needle = f.company?.toLowerCase();
      const contacts = (await listContacts(db, userId)).filter(
        (c) => !needle || (c.company ?? "").toLowerCase().includes(needle),
      );
      return { count: contacts.length, contacts: contacts.map(({ interactions: _i, ...c }) => c) };
    },
  },
  {
    name: "get_contact",
    description: "One contact with their interactions, newest first. Give id or externalRef.",
    inputSchema: { type: "object", properties: refProps, additionalProperties: false },
    async run({ db, userId }, args) {
      return findContact({ db }, userId, RefSchema.parse(args));
    },
  },
  {
    name: "upsert_contact",
    description:
      "Create or update a contact. Idempotent on externalRef; fields left out keep their value. status is one of not-contacted, awaiting-reply, in-conversation, met, dormant - set awaiting-reply only once a message is confirmed sent (a draft is not a sent message).",
    inputSchema: {
      type: "object",
      properties: {
        externalRef: refProps.externalRef,
        name: str,
        company: { type: ["string", "null"] },
        role: { type: ["string", "null"] },
        location: { type: ["string", "null"] },
        warmth: { type: "string", enum: WarmthSchema.options },
        status: { type: "string", enum: ContactSchema.shape.status.options },
        network: {
          type: ["object", "null"],
          properties: { name: str, class: { type: ["string", "null"] }, campus: { type: ["string", "null"] } },
          required: ["name", "class", "campus"],
        },
        interests: { type: "array", items: str },
        nextFollowup: { type: ["string", "null"], description: "ISO date YYYY-MM-DD" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    async run({ db, userId }, args) {
      const r = await upsertContact({ db }, userId, UpsertContactSchema.parse(args));
      const { interactions: _i, ...contact } = r.record;
      return { created: r.created, contact };
    },
  },
  {
    name: "log_interaction",
    description:
      "Record one thing that actually happened with a contact (a message sent, a reply, a call) on its date. channel is linkedin, whatsapp, email, coffee or call. The same date, channel and summary is recorded once.",
    inputSchema: {
      type: "object",
      properties: {
        ...refProps,
        date: dateProp,
        channel: { type: "string", enum: InteractionSchema.shape.channel.options },
        summary: str,
      },
      required: ["date", "channel", "summary"],
      additionalProperties: false,
    },
    async run({ db, userId }, args) {
      const { id, externalRef, ...interaction } = LogInteractionSchema.parse(args);
      return logInteraction({ db }, userId, { id, externalRef }, interaction);
    },
  },
];
