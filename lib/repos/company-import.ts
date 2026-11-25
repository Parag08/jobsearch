import { z } from "zod";
import { IMPORT_MAX_ROWS, type ImportPlanRow } from "../companies/import-review";
import { publicCompanyName } from "../companies/public-company";
import { norm } from "../types";
import { companyWebsite } from "../watchlist/daily";
import { oneOrNull, type DbClient } from "./db";

const idSchema = z.uuid();
const planRow = z.strictObject({
  id: z.string().max(80).nullable(),
  name: z.string().max(160).nullable(),
  identity: z.string().min(1).max(320),
  website: z.string().max(261).nullable(),
  active: z.boolean().nullable(),
}).refine(({ id, name, identity, website, active }) => id
  ? name === null && active !== null
  : id === null && name !== null && active === null && publicCompanyName(name) === name && norm(name) === identity &&
    (website === null || companyWebsite(website) === website));

const requestSchema = z.strictObject({
  id: idSchema,
  plan: planRow.array().min(1).max(IMPORT_MAX_ROWS),
  skipped: z.number().int().min(0).max(IMPORT_MAX_ROWS),
}).refine(({ plan, skipped }) => plan.length + skipped <= IMPORT_MAX_ROWS &&
  plan.some((r) => r.active !== true) && new Set(plan.map((r) => r.identity)).size === plan.length);

export type ImportPayload = ([string, string | null] | [string, string, string | null, boolean])[];

const payloadSchema = z.union([
  z.tuple([z.string().max(160), z.string().max(261).nullable()]),
  z.tuple([z.string().max(80), z.string().max(320), z.string().max(261).nullable(), z.boolean()]),
]).array().min(1).max(IMPORT_MAX_ROWS);

export function unpackImportPayload(input: unknown): ImportPlanRow[] | null {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return null;
  return parsed.data.map((raw): ImportPlanRow => raw.length === 2
    ? { id: null, name: raw[0], identity: norm(raw[0]), website: raw[1], active: null }
    : { id: raw[0], name: null, identity: raw[1], website: raw[2], active: raw[3] });
}

export function latestCompanyImport(db: DbClient, userId: string) {
  return oneOrNull(db.from("company_imports").select().eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle(), "company_imports", "latest");
}

export async function commitCompanyImport(db: DbClient, userId: string, id: unknown, plan: unknown, skipped: unknown) {
  const valid = requestSchema.safeParse({ id, plan, skipped });
  if (!valid.success) return null;
  return oneOrNull(db.rpc("apply_company_import", {
    p_user_id: userId, p_id: valid.data.id, p_plan: valid.data.plan, p_skipped: valid.data.skipped,
  }), "company_imports", "commit");
}

export async function undoCompanyImport(db: DbClient, userId: string, id: unknown) {
  const valid = idSchema.safeParse(id);
  if (!valid.success) return null;
  return oneOrNull(db.rpc("apply_company_import", { p_user_id: userId, p_id: valid.data }), "company_imports", "undo");
}
