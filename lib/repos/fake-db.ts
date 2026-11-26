import { pgArray } from "./db";
import type { CompanyImportRpc, DbClient, DbResult, DbTable } from "./db";
import type { CompanyImportRow, RowOf, TableName } from "./rows";
import { norm } from "../types";

type Row = Record<string, unknown>;

/**
 * In-memory test double for the DbClient chain (the FakeLlm pattern, for the
 * DB). Mirrors supabase-js semantics: thenable builders resolving {data,error},
 * single()/maybeSingle(), upsert onConflict, postgres-style "nulls are
 * distinct" on conflict columns, generated ids on insert.
 */
export class FakeDb implements DbClient {
  private tables = new Map<string, Row[]>();
  private seq = 0;

  constructor(private readonly newRowId?: () => string) {}

  /** Inspect a table's raw rows (assertions on DB-only columns like jd_raw). */
  rows<T extends TableName>(table: T): RowOf<T>[] {
    return structuredClone(this.tableRows(table)) as unknown as RowOf<T>[];
  }

  patchRows<T extends TableName>(table: T, match: Partial<RowOf<T>>, patch: Partial<RowOf<T>>): void {
    const keys = Object.entries(match);
    for (const row of this.tableRows(table)) {
      if (keys.every(([key, value]) => row[key] === value)) Object.assign(row, structuredClone(patch));
    }
  }

  seed<T extends TableName>(table: T, rows: Partial<RowOf<T>>[]): void {
    for (const r of rows) this.tableRows(table).push({ id: this.nextId(), ...structuredClone(r) });
  }

  from<T extends TableName>(table: T): DbTable<RowOf<T>> {
    return new FakeTable(this.tableRows(table), this.newRowId ?? (() => this.nextId())) as unknown as DbTable<RowOf<T>>;
  }

  async rpc(_name: "apply_company_import", { p_user_id: user, p_id: id, p_plan: plan, p_skipped: skipped }: CompanyImportRpc):
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
  ) {}

  select(_columns?: string): FakeQuery {
    return new FakeQuery(this.rows, "select", [], [], this.nextId);
  }
  insert(values: Row | Row[]): FakeQuery {
    return new FakeQuery(this.rows, "insert", asArray(values), [], this.nextId);
  }
  upsert(values: Row | Row[], opts: { onConflict: string }): FakeQuery {
    const conflict = opts.onConflict.split(",").map((c) => c.trim());
    return new FakeQuery(this.rows, "upsert", asArray(values), conflict, this.nextId);
  }
  update(patch: Row): FakeQuery {
    return new FakeQuery(this.rows, "update", [patch], [], this.nextId);
  }
  delete(): FakeQuery {
    return new FakeQuery(this.rows, "delete", [], [], this.nextId);
  }
}

class FakeQuery {
  private filters: { col: string; values: unknown[] }[] = [];
  private filterError: string | null = null;
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private rangeN: [number, number] | null = null;
  private returning: boolean;
  private mode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private readonly rows: Row[],
    private readonly op: "select" | "insert" | "upsert" | "update" | "delete",
    private readonly payload: Row[],
    private readonly conflict: string[],
    private readonly nextId: () => string,
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
    this.orderBy = { col, ascending: opts?.ascending ?? true };
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
  select(): this {
    this.returning = true;
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
    let affected: Row[];
    switch (this.op) {
      case "select":
        affected = this.rows.filter((r) => this.matches(r));
        break;
      case "insert":
        affected = this.payload.map((v) => this.insertRow(v));
        break;
      case "upsert":
        affected = this.payload.map((v) => this.upsertRow(v));
        break;
      case "update": {
        affected = this.rows.filter((r) => this.matches(r));
        for (const r of affected) Object.assign(r, structuredClone(this.payload[0]));
        break;
      }
      case "delete": {
        affected = this.rows.filter((r) => this.matches(r));
        for (const r of affected) this.rows.splice(this.rows.indexOf(r), 1);
        break;
      }
    }
    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      affected = [...affected].sort((x, y) => {
        const a = x[col] as string | number | null;
        const b = y[col] as string | number | null;
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return (a < b ? -1 : a > b ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (this.limitN != null) affected = affected.slice(0, this.limitN);
    if (this.rangeN) affected = affected.slice(...this.rangeN);

    if (!this.returning) return { data: null, error: null };
    const out = structuredClone(affected);
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

  private matches(row: Row): boolean {
    return this.filters.every((f) => f.values.some((v) => same(row[f.col], v)));
  }

  private insertRow(values: Row): Row {
    const row: Row = { id: this.nextId(), ...structuredClone(values) };
    this.rows.push(row);
    return row;
  }

  private upsertRow(values: Row): Row {
    const usable = this.conflict.length > 0 && this.conflict.every((c) => values[c] != null);
    const existing = usable
      ? this.rows.find((r) => this.conflict.every((c) => same(r[c], values[c])))
      : undefined;
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
