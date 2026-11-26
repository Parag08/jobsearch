/**
 * One sample workspace per demo visitor, in memory (docs/DESIGN.md "Demo"). Bounded twice:
 * a visitor idle past `ttlMs` starts over, and past `max` visitors the longest-idle one is
 * dropped. A serverless instance that restarts simply hands out fresh copies.
 */
export class VisitorStore<T> {
  private entries = new Map<string, { value: T; seen: number }>();

  constructor(
    private readonly make: () => T,
    private readonly opts: { ttlMs: number; max: number },
  ) {}

  get(id: string, now = Date.now()): T {
    const hit = this.entries.get(id);
    if (hit && now - hit.seen <= this.opts.ttlMs) {
      // Re-insert so Map order stays least-recently-seen first.
      this.entries.delete(id);
      this.entries.set(id, { value: hit.value, seen: now });
      return hit.value;
    }
    this.entries.delete(id);
    for (const [k, e] of this.entries) if (now - e.seen > this.opts.ttlMs) this.entries.delete(k);
    while (this.entries.size >= this.opts.max) this.entries.delete(this.entries.keys().next().value as string);
    const value = this.make();
    this.entries.set(id, { value, seen: now });
    return value;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get size(): number {
    return this.entries.size;
  }
}

/** The cookie that marks a browser as a demo visitor. */
export const DEMO_COOKIE = "jobsearch_demo";
export const DEMO_KITS_COOKIE = "jobsearch_demo_kits";
/** How long a demo visit lasts without activity, in seconds (cookie and store agree). */
export const DEMO_TTL_SECONDS = 2 * 60 * 60;

export function newVisitorId(): string {
  return crypto.randomUUID();
}

export function isVisitorId(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * DEMO_MAX_VISITORS (.env.example): how many sample workspaces one server keeps at once.
 * No in-code default: unset = the public demo is off, which is also its kill switch.
 */
export function demoMaxVisitorsFromEnv(env: Record<string, string | undefined>): number | undefined {
  const raw = env.DEMO_MAX_VISITORS;
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`DEMO_MAX_VISITORS must be a whole number >= 1, got "${raw}"`);
  return n;
}
