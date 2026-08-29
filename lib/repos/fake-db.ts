import type { DbClient, DbResult, DbTable } from "./db";
import type { RowOf, TableName } from "./rows";

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

  /** Inspect a table's raw rows (assertions on DB-only columns like jd_raw). */
  rows<T extends TableName>(table: T): RowOf<T>[] {
    return structuredClone(this.tableRows(table)) as unknown as RowOf<T>[];
  }

  seed<T extends TableName>(table: T, rows: Partial<RowOf<T>>[]): void {
    for (const r of rows) this.tableRows(table).push({ id: this.nextId(), ...structuredClone(r) });
  }

  from<T extends TableName>(table: T): DbTable<RowOf<T>> {
    return new FakeTable(this.tableRows(table), () => this.nextId()) as unknown as DbTable<RowOf<T>>;
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
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
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
    this.filters.push({ col, values: [value] });
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.filters.push({ col, values });
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
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
