import { pgArray } from "./db";
import type { CompanyImportRpc, CreateApiTokenRpc, DbClient, DbResult, DbTable, TakeAiCallRpc } from "./db";
import type { ApiTokenRow, CompanyImportRow, RowOf, TableName } from "./rows";
import { norm } from "../types";

type Row = Record<string, unknown>;

function projectRow(row: Row, columns: string[]): Row {
  const out: Row = {};
  for (const field of columns) {
    const [alias, expression = alias] = field.split(":");
    const [column, ...path] = expression.split("->");
    if (column in row) {
      out[alias] = path.reduce<unknown>((value, key) =>
        value != null && typeof value === "object" ? (value as Row)[key] ?? null : null, row[column]);
    }
  }
  return out;
}

/** Caps on what writes may add to a FakeDb (the public demo, lib/db/demo.ts). Sizes are JSON characters. */
export interface FakeDbLimits {
  maxRowsPerTable: number;
  maxRowChars: number;
  maxTotalChars: number;
}

interface PendingWrite {
  before?: Row;
  after: Row;
}

const ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const rowChars = (row: Row) => JSON.stringify(row)?.length ?? 0;

/** Tracks every stored row's size so a write past a limit is refused before it lands. */
class WriteBudget {
  private sizes = new WeakMap<Row, number>();
  private used = 0;

  constructor(private readonly limits: FakeDbLimits, tables: Iterable<Row[]>) {
    this.recount(tables);
  }

  recount(tables: Iterable<Row[]>): void {
    this.used = 0;
    for (const rows of tables) for (const row of rows) this.used += this.measure(row);
  }

  check(rows: Row[], writes: PendingWrite[]): string | null {
    const added = writes.filter((w) => !w.before).length;
    if (added > 0 && rows.length + added > this.limits.maxRowsPerTable) {
      return `demo workspace limit: at most ${this.limits.maxRowsPerTable} rows per table`;
    }
    let delta = 0;
    for (const w of writes) {
      const n = rowChars(w.after);
      if (n > this.limits.maxRowChars) return `demo workspace limit: a record may hold at most ${this.limits.maxRowChars} characters`;
      delta += n - (w.before ? this.sizes.get(w.before) ?? 0 : 0);
    }
    if (delta > 0 && this.used + delta > this.limits.maxTotalChars) return "demo workspace limit: this sample workspace is full";
    return null;
  }

  /** Why the stored rows break a limit, or null when they fit. */
  exceeded(tables: Iterable<Row[]>): string | null {
    for (const rows of tables) {
      if (rows.length > this.limits.maxRowsPerTable) return `demo workspace limit: at most ${this.limits.maxRowsPerTable} rows per table`;
      if (rows.some((row) => (this.sizes.get(row) ?? 0) > this.limits.maxRowChars)) {
        return `demo workspace limit: a record may hold at most ${this.limits.maxRowChars} characters`;
      }
    }
    return this.used > this.limits.maxTotalChars ? "demo workspace limit: this sample workspace is full" : null;
  }

  wrote(rows: Row[]): void {
    for (const row of rows) {
      const old = this.sizes.get(row) ?? 0;
      this.used += this.measure(row) - old;
    }
  }

  removed(rows: Row[]): void {
    for (const row of rows) {
      this.used -= this.sizes.get(row) ?? 0;
      this.sizes.delete(row);
    }
  }

  private measure(row: Row): number {
    const n = rowChars(row);
    this.sizes.set(row, n);
    return n;
  }
}

/**
 * In-memory test double for the DbClient chain (the FakeLlm pattern, for the
 * DB). Mirrors supabase-js semantics: thenable builders resolving {data,error},
 * single()/maybeSingle(), upsert onConflict, postgres-style "nulls are
 * distinct" on conflict columns, generated ids on insert.
 */
export class FakeDb implements DbClient {
  private tables = new Map<string, Row[]>();
  private seq = 0;
  private budget: WriteBudget | null = null;

  constructor(private readonly newRowId?: () => string) {}

  /** From now on, refuse writes through from()/rpc() that would pass `limits` (seeded rows count toward the total). */
  limitWrites(limits: FakeDbLimits): void {
    this.budget = new WriteBudget(limits, this.tables.values());
  }

  /** Inspect a table's raw rows (assertions on DB-only columns like jd_raw). */
  rows<T extends TableName>(table: T): RowOf<T>[] {
    return structuredClone(this.tableRows(table)) as unknown as RowOf<T>[];
  }

  patchRows<T extends TableName>(table: T, match: Partial<RowOf<T>>, patch: Partial<RowOf<T>>): void {
    const keys = Object.entries(match);
    for (const row of this.tableRows(table)) {
      if (keys.every(([key, value]) => row[key] === value)) {
        Object.assign(row, structuredClone(patch));
        this.budget?.wrote([row]);
      }
    }
  }

  seed<T extends TableName>(table: T, rows: Partial<RowOf<T>>[]): void {
    const added = rows.map((r) => ({ id: this.nextId(), ...structuredClone(r) }));
    this.tableRows(table).push(...added);
    this.budget?.wrote(added);
  }

  from<T extends TableName>(table: T): DbTable<RowOf<T>> {
    return new FakeTable(this.tableRows(table), this.newRowId ?? (() => this.nextId()), this.budget) as unknown as DbTable<RowOf<T>>;
  }

  rpc(name: "apply_company_import", args: CompanyImportRpc): Promise<DbResult<CompanyImportRow>>;
  rpc(name: "create_api_token", args: CreateApiTokenRpc): Promise<DbResult<ApiTokenRow>>;
  rpc(name: "take_ai_call", args: TakeAiCallRpc): Promise<DbResult<number>>;
  async rpc(name: string, args: CompanyImportRpc | CreateApiTokenRpc | TakeAiCallRpc): Promise<DbResult<CompanyImportRow | ApiTokenRow | number>> {
    if (name === "create_api_token") return this.createApiToken(args as CreateApiTokenRpc);
    if (name === "take_ai_call") return this.takeAiCall(args as TakeAiCallRpc);
    const importArgs = args as CompanyImportRpc;
    if (!this.budget) return this.applyCompanyImport("apply_company_import", importArgs);
    // The import touches several tables at once, so measure the result and roll back if it does not fit.
    const before = structuredClone(this.tables);
    const result = await this.applyCompanyImport("apply_company_import", importArgs);
    this.budget.recount(this.tables.values());
    const error = this.budget.exceeded(this.tables.values());
    if (!error) return result;
    this.tables = before;
    this.budget.recount(this.tables.values());
    return { data: null, error: { message: error } };
  }
  /** Mirrors public.take_ai_call (migration 0025): a sliding window over the user's calls. */
  private takeAiCall({ p_user_id: user, p_limit, p_window_seconds }: TakeAiCallRpc): DbResult<number> {
    const calls = this.tableRows("ai_calls");
    const now = Date.now();
    const ceiling = 5000;
    const day = 86_400_000;
    const limit = Math.min(Math.max(1, p_limit), ceiling);
    const windowMs = Math.min(Math.max(p_window_seconds, 60), 86_400) * 1000;
    for (let i = calls.length - 1; i >= 0; i--) if (calls[i].user_id === user && Date.parse(String(calls[i].at)) <= now - day) calls.splice(i, 1);
    const mine = calls.filter((c) => c.user_id === user).map((c) => Date.parse(String(c.at))).sort((a, b) => a - b);
    const inWindow = mine.filter((at) => at > now - windowMs);
    if (inWindow.length >= limit) {
      const frees = inWindow[inWindow.length - limit];
      return { data: Math.max(1, Math.ceil((frees + windowMs - now) / 1000)), error: null };
    }
    if (mine.length >= ceiling) {
      const frees = mine[mine.length - ceiling];
      return { data: Math.max(1, Math.ceil((frees + day - now) / 1000)), error: null };
    }
    calls.push({ id: this.nextId(), user_id: user, at: new Date(now).toISOString() });
    return { data: 0, error: null };
  }

  /** Mirrors create_api_token (0024): the server sets expiry and the rate-limit window. */
  private async createApiToken({ p_user_id, p_name, p_token_hash, p_scope, p_days }: CreateApiTokenRpc):
    Promise<DbResult<ApiTokenRow>> {
    if (p_name.length < 1 || p_name.length > 60 || !/^[0-9a-f]{64}$/.test(p_token_hash) ||
      !["read", "write"].includes(p_scope) || ![30, 90, 365].includes(p_days)) return { data: null, error: null };
    const now = Date.now();
    const row: Row = {
      id: this.newRowId?.() ?? this.nextId(), user_id: p_user_id, name: p_name, token_hash: p_token_hash,
      created_at: new Date(now).toISOString(), last_used_at: null, revoked_at: null, scope: p_scope,
      expires_at: new Date(now + p_days * 24 * 60 * 60 * 1000).toISOString(), window_start: null, window_count: 0,
    };
    this.tableRows("api_tokens").push(row);
    return { data: structuredClone(row) as unknown as ApiTokenRow, error: null };
  }

  private async applyCompanyImport(_name: "apply_company_import", { p_user_id: user, p_id: id, p_plan: plan, p_skipped: skipped }: CompanyImportRpc):
    Promise<DbResult<CompanyImportRow>> {
    const receipts = this.tableRows("company_imports");
    const companies = this.tableRows("sourcing_companies");
    const latest = receipts.filter((r) => r.user_id === user).at(-1);
    const prior = receipts.find((r) => r.user_id === user && r.id === id);
    const result = (row?: Row) => ({ data: row ? structuredClone(row) as unknown as CompanyImportRow : null, error: null });
    if (!plan) {
      if (!latest || latest !== prior) return result();
      if (latest.undone_count !== null) return result(latest);
      const removals = companies.filter((c) => c.user_id === user && c.active && c.import_id === id);
      const removedIds = new Set(removals.map((c) => c.id));
      for (const c of removals) Object.assign(c, { active: false, import_id: null });
      const prepared = new Set(this.tableRows("applications").filter((a) => a.user_id === user).map((a) => a.external_ref));
      for (const job of this.tableRows("sourced_jobs")) {
        if (job.user_id === user && removedIds.has(job.company_id) && !prepared.has(`sourced:${job.id}`) &&
          (job.sourcing_decision === "picked" || (!job.sourcing_decision && job.status === "shortlisted"))) {
          job.sourcing_decision = "available";
        }
      }
      latest.undone_count = removals.length;
      return result(latest);
    }
    if (prior) return result(prior);
    const existing = companies.filter((c) => c.user_id === user);
    const newWebsites = plan.filter((r) => r.id === null && r.website).map((r) => r.website);
    if (new Set(newWebsites).size !== newWebsites.length || plan.some((r) => r.id
      ? !existing.some((c) => c.id === r.id && c.identity === r.identity && c.active === r.active && (c.website ?? null) === r.website)
      : existing.some((c) => c.identity === r.identity || (r.website && c.website === r.website)))) return result();

    const receipt = {
      id, user_id: user, created_at: new Date(Math.max(Date.now(), (latest ? Date.parse(String(latest.created_at)) : 0) + 1)).toISOString(),
      new_count: 0, reused_count: 0, skipped_count: skipped, undone_count: null, company_ids: [] as string[],
    };
    for (const r of plan) {
      if (r.id === null) {
        const companyId = this.newRowId?.() ?? this.nextId();
        companies.push({ id: companyId, user_id: user, name: r.name, identity: r.identity, website: r.website,
          active: true, import_id: id, research: [], research_version: 0, research_requested: false });
        for (const table of ["watchlist", "sourced_jobs", "applications", "contacts"]) {
          for (const row of this.tableRows(table)) {
            if (row.user_id === user && typeof row.company === "string" && norm(row.company) === r.identity) row.company_id = companyId;
          }
        }
        receipt.new_count++;
        receipt.company_ids.push(companyId);
      } else if (!r.active) {
        Object.assign(existing.find((c) => c.id === r.id)!, { active: true, import_id: id });
        receipt.reused_count++;
        receipt.company_ids.push(r.id);
      }
    }
    receipts.push(receipt);
    return result(receipt);
  }

  private tableRows(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  private nextId(): string {
    return `fake-id-${++this.seq}`;
  }
}

class FakeTable {
  constructor(
    private readonly rows: Row[],
    private readonly nextId: () => string,
    private readonly budget: WriteBudget | null,
  ) {}

  select(columns?: string): FakeQuery {
    return this.query("select", []).select(columns);
  }
  insert(values: Row | Row[]): FakeQuery {
    return this.query("insert", asArray(values));
  }
  upsert(values: Row | Row[], opts: { onConflict: string; ignoreDuplicates?: boolean }): FakeQuery {
    const conflict = opts.onConflict.split(",").map((c) => c.trim());
    return this.query("upsert", asArray(values), conflict, opts.ignoreDuplicates);
  }
  update(patch: Row): FakeQuery {
    return this.query("update", [patch]);
  }
  delete(): FakeQuery {
    return this.query("delete", []);
  }

  private query(op: FakeQuery["op"], payload: Row[], conflict: string[] = [], ignoreDuplicates = false): FakeQuery {
    return new FakeQuery(this.rows, op, payload, conflict, this.nextId, this.budget, ignoreDuplicates);
  }
}

class FakeQuery {
  private filters: { col: string; values: unknown[] }[] = [];
  private filterError: string | null = null;
  private orderBy: { col: string; ascending: boolean }[] = [];
  private limitN: number | null = null;
  private rangeN: [number, number] | null = null;
  private returning: boolean;
  private columns?: string[];
  private mode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private readonly rows: Row[],
    readonly op: "select" | "insert" | "upsert" | "update" | "delete",
    private readonly payload: Row[],
    private readonly conflict: string[],
    private readonly nextId: () => string,
    private readonly budget: WriteBudget | null = null,
    private readonly ignoreDuplicates = false,
  ) {
    this.returning = op === "select";
  }

  eq(col: string, value: unknown): this {
    // PostgREST serialises a JS array as "a,b" and Postgres rejects it; callers must use pgArray().
    if (Array.isArray(value)) this.filterError = `malformed array literal: "${value.join(",")}"`;
    this.filters.push({ col, values: [value] });
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.filters.push({ col, values });
    return this;
  }
  is(col: string, value: boolean | null): this {
    this.filters.push({ col, values: value === null ? [null, undefined] : [value] });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(count: number): this {
    this.limitN = count;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeN = [from, to + 1];
    return this;
  }
  select(columns = "*"): this {
    this.returning = true;
    const fields = columns.split(",").map((c) => c.trim());
    this.columns = fields.includes("*") ? undefined : fields;
    return this;
  }
  single(): this {
    this.returning = true;
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.returning = true;
    this.mode = "maybeSingle";
    return this;
  }

  then<TResult1 = DbResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private run(): DbResult<unknown> {
    if (this.filterError) return { data: null, error: { message: this.filterError } };
    const overBudget = this.budget?.check(this.rows, this.pendingWrites());
    if (overBudget) return { data: null, error: { message: overBudget } };
    let affected: Row[];
    switch (this.op) {
      case "select":
        affected = this.rows.filter((r) => this.matches(r));
        break;
      case "insert":
        affected = this.payload.map((v) => this.insertRow(v));
        break;
      case "upsert":
        affected = this.payload.flatMap((v) => this.ignoreDuplicates && this.conflictRow(v) ? [] : [this.upsertRow(v)]);
        break;
      case "update": {
        affected = this.rows.filter((r) => this.matches(r));
        for (const r of affected) Object.assign(r, structuredClone(this.payload[0]));
        break;
      }
      case "delete": {
        affected = this.rows.filter((r) => this.matches(r));
        for (const r of affected) this.rows.splice(this.rows.indexOf(r), 1);
        this.budget?.removed(affected);
        break;
      }
    }
    if (this.op !== "select" && this.op !== "delete") this.budget?.wrote(affected);
    if (this.orderBy.length) {
      affected = [...affected].sort((x, y) => {
        for (const { col, ascending } of this.orderBy) {
          const a = x[col] as string | number | null;
          const b = y[col] as string | number | null;
          if (a == null && b == null) continue;
          if (a == null) return 1;
          if (b == null) return -1;
          if (a !== b) return (a < b ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
    }
    if (this.limitN != null) affected = affected.slice(0, this.limitN);
    if (this.rangeN) affected = affected.slice(...this.rangeN);

    if (!this.returning) return { data: null, error: null };
    const columns = this.columns;
    const out = structuredClone(columns
      ? affected.map((row) => projectRow(row, columns))
      : affected);
    if (this.mode === "single") {
      return out.length === 1
        ? { data: out[0] as unknown, error: null }
        : { data: null, error: { message: `single() expected exactly 1 row, got ${out.length}` } };
    }
    if (this.mode === "maybeSingle") {
      return out.length <= 1
        ? { data: (out[0] ?? null) as unknown, error: null }
        : { data: null, error: { message: `maybeSingle() expected at most 1 row, got ${out.length}` } };
    }
    return { data: out, error: null };
  }

  private pendingWrites(): PendingWrite[] {
    switch (this.op) {
      case "insert":
        return this.payload.map((v) => ({ after: { id: ID_PLACEHOLDER, ...v } }));
      case "upsert":
        return this.payload.flatMap((v) => {
          const before = this.conflictRow(v);
          if (before && this.ignoreDuplicates) return [];
          return [before ? { before, after: { ...before, ...v } } : { after: { id: ID_PLACEHOLDER, ...v } }];
        });
      case "update":
        return this.rows.filter((r) => this.matches(r)).map((before) => ({ before, after: { ...before, ...this.payload[0] } }));
      default:
        return [];
    }
  }

  private conflictRow(values: Row): Row | undefined {
    const usable = this.conflict.length > 0 && this.conflict.every((c) => values[c] != null);
    return usable ? this.rows.find((r) => this.conflict.every((c) => same(r[c], values[c]))) : undefined;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => f.values.some((v) => same(row[f.col], v)));
  }

  private insertRow(values: Row): Row {
    const row: Row = { id: this.nextId(), ...structuredClone(values) };
    this.rows.push(row);
    return row;
  }

  private upsertRow(values: Row): Row {
    const existing = this.conflictRow(values);
    if (existing) {
      Object.assign(existing, structuredClone(values));
      return existing;
    }
    return this.insertRow(values);
  }
}

function asArray(v: Row | Row[]): Row[] {
  return Array.isArray(v) ? v : [v];
}

/** Structural equality, matching postgres =: arrays/jsonb compare by value. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && typeof b === "string") return pgArray(a.map(String)) === b;
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
