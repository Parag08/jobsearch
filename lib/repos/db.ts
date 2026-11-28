import type { RowOf, TableName } from "./rows";
import type { ImportPlanRow } from "../companies/import-review";
import type { ApiTokenRow, CompanyImportRow, SourcedJobRow } from "./rows";

export type CompanyImportRpc = {
  p_user_id: string;
  p_id: string;
  p_plan?: ImportPlanRow[];
  p_skipped?: number;
};

export type TakeAiCallRpc = {
  p_user_id: string;
  p_limit: number;
  p_window_seconds: number;
};

export type ApplySourcedJobRetirementRpc = {
  p_user_id: string;
  p_updates: {
    id: string;
    prior_status: SourcedJobRow["status"];
    status: SourcedJobRow["status"];
    sourcing_board_url: string | null;
    missed_refreshes: number;
  }[];
};

/** Arguments of create_api_token (migration 0024), the only way a token row is made. */
export type CreateApiTokenRpc = {
  p_user_id: string;
  p_name: string;
  p_token_hash: string;
  p_scope: "read" | "write";
  p_days: number;
};

/**
 * Structural subset of the supabase-js query-builder chain that the repos use.
 * Repos are written against THIS interface only; the real SupabaseClient
 * satisfies it structurally once Supabase is connected, and FakeDb implements
 * it in-memory for tests. Extend it call-shape-for-call-shape with supabase-js
 * (never invent chains the real client doesn't have).
 */
export interface DbResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface DbSelect<R> extends PromiseLike<DbResult<R[]>> {
  eq(column: keyof R & string, value: unknown): DbSelect<R>;
  in(column: keyof R & string, values: unknown[]): DbSelect<R>;
  is(column: keyof R & string, value: boolean | null): DbSelect<R>;
  order(column: keyof R & string, opts?: { ascending?: boolean }): DbSelect<R>;
  limit(count: number): DbSelect<R>;
  range(from: number, to: number): DbSelect<R>;
  single(): PromiseLike<DbResult<R>>;
  maybeSingle(): PromiseLike<DbResult<R | null>>;
}

export interface DbWrite<R> extends PromiseLike<DbResult<null>> {
  select(): DbSelect<R>;
}

export interface DbUpdate<R> extends PromiseLike<DbResult<null>> {
  eq(column: keyof R & string, value: unknown): DbUpdate<R>;
  is(column: keyof R & string, value: boolean | null): DbUpdate<R>;
  select(): DbSelect<R>;
}

export interface DbDelete extends PromiseLike<DbResult<null>> {
  eq(column: string, value: unknown): DbDelete;
  in(column: string, values: unknown[]): DbDelete;
}

export interface DbTable<R> {
  select(columns?: string): DbSelect<R>;
  insert(values: Partial<R> | Partial<R>[]): DbWrite<R>;
  upsert(values: Partial<R> | Partial<R>[], opts: { onConflict: string; ignoreDuplicates?: boolean }): DbWrite<R>;
  update(patch: Partial<R>): DbUpdate<R>;
  delete(): DbDelete;
}

export interface DbClient {
  from<T extends TableName>(table: T): DbTable<RowOf<T>>;
  rpc(name: "apply_company_import", args: CompanyImportRpc): PromiseLike<DbResult<CompanyImportRow>>;
  /** 0 = allowed and recorded; n > 0 = refused, retry in n seconds; null = refused (not this user). */
  rpc(name: "take_ai_call", args: TakeAiCallRpc): PromiseLike<DbResult<number>>;
  rpc(name: "create_api_token", args: CreateApiTokenRpc): PromiseLike<DbResult<ApiTokenRow>>;
  rpc(name: "apply_sourced_job_retirement", args: ApplySourcedJobRetirementRpc): PromiseLike<DbResult<null>>;
}

export const LIST_LIMIT = 500;
export const HISTORY_LIMIT = 100;

/** Every repo call either returns typed data or throws this - raw {data,error} never leaks upward. */
export class RepoError extends Error {
  constructor(
    readonly table: TableName,
    readonly op: string,
    message: string,
  ) {
    super(`${table}.${op}: ${message}`);
    this.name = "RepoError";
  }
}

export async function many<T>(
  q: PromiseLike<DbResult<T[]>>,
  table: TableName,
  op: string,
): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new RepoError(table, op, error.message);
  return data ?? [];
}

export async function manyByPage<T>(query: DbSelect<T>, table: TableName, op: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += LIST_LIMIT) {
    const page = await many(query.range(offset, offset + LIST_LIMIT - 1), table, op);
    rows.push(...page);
    if (page.length < LIST_LIMIT) return rows;
  }
}

export async function one<T>(
  q: PromiseLike<DbResult<T>>,
  table: TableName,
  op: string,
): Promise<T> {
  const { data, error } = await q;
  if (error || data == null) throw new RepoError(table, op, error?.message ?? "no row returned");
  return data;
}

export async function oneOrNull<T>(
  q: PromiseLike<DbResult<T | null>>,
  table: TableName,
  op: string,
): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw new RepoError(table, op, error.message);
  return data;
}

/**
 * A Postgres array literal for filtering an array column with eq().
 * supabase-js sends a JS array as "a,b,c" (no braces), which Postgres rejects
 * as a malformed array literal - so array filters must go through this.
 */
export function pgArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}
