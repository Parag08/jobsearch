import type { RowOf, TableName } from "./rows";

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
  order(column: keyof R & string, opts?: { ascending?: boolean }): DbSelect<R>;
  limit(count: number): DbSelect<R>;
  single(): PromiseLike<DbResult<R>>;
  maybeSingle(): PromiseLike<DbResult<R | null>>;
}

export interface DbWrite<R> extends PromiseLike<DbResult<null>> {
  select(): DbSelect<R>;
}

export interface DbUpdate<R> extends PromiseLike<DbResult<null>> {
  eq(column: keyof R & string, value: unknown): DbUpdate<R>;
  select(): DbSelect<R>;
}

export interface DbDelete extends PromiseLike<DbResult<null>> {
  eq(column: string, value: unknown): DbDelete;
}

export interface DbTable<R> {
  select(columns?: string): DbSelect<R>;
  insert(values: Partial<R> | Partial<R>[]): DbWrite<R>;
  upsert(values: Partial<R> | Partial<R>[], opts: { onConflict: string }): DbWrite<R>;
  update(patch: Partial<R>): DbUpdate<R>;
  delete(): DbDelete;
}

export interface DbClient {
  from<T extends TableName>(table: T): DbTable<RowOf<T>>;
}

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
