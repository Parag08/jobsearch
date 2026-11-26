import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";
import type { FakeDb } from "../repos/fake-db";
import { ClosedReasonSchema, StageSchema } from "../types";
import { safePostingUrl } from "../watchlist/daily";
import { Evidence, SafeKit } from "../watchlist/safe-kit";
import { signDemoMac, verifyDemoMac } from "../demo/node-mac";
import { DEMO_KITS_COOKIE_LIMIT } from "../demo/visitors";
import { DEMO_USER_ID } from "./demo";

const journalLimit = 16_384;
const maxKits = 12;
const Role = z.string().regex(/^demo-\d{1,3}$/);
const Decision = z.enum(["picked", "later", "dismissed", "available"]);
const Kit = z.strictObject({
  id: z.uuid(), role: Role, kit: SafeKit, revision: z.number().int().nonnegative(),
  stage: StageSchema, reason: ClosedReasonSchema.nullable(),
  saved: z.iso.date(), applied: z.iso.date().nullable(), updated: z.iso.date(),
  next: z.string().max(100).nullable(),
});
const Journal = z.strictObject({
  v: z.literal(1),
  updated: z.number().int().positive(),
  kits: z.array(Kit).max(maxKits),
  decisions: z.array(z.tuple([Role, Decision])).max(maxKits),
  evidence: z.array(Evidence).max(Evidence.options.length),
});
type Journal = z.infer<typeof Journal>;

const globalState = globalThis as { __jobsearchKitVersions?: WeakMap<FakeDb, number> };
const versions = globalState.__jobsearchKitVersions ??= new WeakMap();

export function writeDemoKits(db: FakeDb, visitor: string, secret: string): string {
  const roles = db.rows("sourced_jobs").filter((r) => r.user_id === DEMO_USER_ID && Role.safeParse(r.external_id).success);
  const roleIds = new Map(roles.map((r) => [r.id, r.external_id]));
  const kits = db.rows("applications").flatMap((row) => {
    if (row.user_id !== DEMO_USER_ID || !row.sourcing_kit) return [];
    const kit = SafeKit.safeParse(row.sourcing_kit);
    if (!kit.success) return [];
    const item = Kit.safeParse({
      id: row.id, role: roleIds.get(kit.data.jobId), kit: kit.data, revision: row.sourcing_revision ?? 0,
      stage: row.stage, reason: row.closed_reason, saved: row.saved_at, applied: row.applied_at, updated: row.updated_at,
      next: row.next_action,
    });
    return item.success ? [item.data] : [];
  }).reverse().sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, maxKits);
  const decisions = roles.flatMap((r) => {
    const decision = Decision.safeParse(r.sourcing_decision);
    return decision.success ? [[r.external_id!, decision.data] as [string, z.infer<typeof Decision>]] : [];
  }).slice(0, maxKits);
  const selected = db.rows("profiles").find((r) => r.user_id === DEMO_USER_ID)?.sourcing_evidence;
  const evidence = Evidence.options.filter((code) => selected?.includes(code));
  const updated = Math.max(Date.now(), (versions.get(db) ?? 0) + 1);
  versions.set(db, updated);
  const journal: Journal = { v: 1, updated, kits, decisions, evidence };
  for (;;) {
    const json = Buffer.from(JSON.stringify(journal));
    if (json.length <= journalLimit) {
      const payload = deflateRawSync(json).toString("base64url");
      if (payload.length + 44 <= DEMO_KITS_COOKIE_LIMIT) {
        return payload + "." + signDemoMac(secret, "kits", visitor + "." + payload);
      }
    }
    if (!journal.kits.pop()) throw new Error("Demo kit journal exceeds its size limit");
  }
}

function readJournal(token: string, visitor: string, secret: string): Journal | null {
  if (token.length > DEMO_KITS_COOKIE_LIMIT) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload) || !signature || extra !== undefined) return null;
  if (!verifyDemoMac(secret, "kits", visitor + "." + payload, signature)) return null;
  try {
    const json = inflateRawSync(Buffer.from(payload, "base64url"), { maxOutputLength: journalLimit }).toString("utf8");
    const result = Journal.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function restoreDemoKits(db: FakeDb, token: string, visitor: string, secret: string) {
  const journal = readJournal(token, visitor, secret);
  if (!journal || journal.updated <= (versions.get(db) ?? 0)) return;
  const demoRoles = db.rows("sourced_jobs").filter((r) => r.user_id === DEMO_USER_ID && Role.safeParse(r.external_id).success);
  const byRole = new Map(demoRoles.map((r) => [r.external_id, r]));
  const byId = new Map(db.rows("applications").map((row) => [row.id, row]));
  for (const entry of journal.kits) {
    const role = byRole.get(entry.role);
    if (!role) continue;
    const patch = {
      stage: entry.stage, closed_reason: entry.reason, saved_at: entry.saved, applied_at: entry.applied, updated_at: entry.updated,
      next_action: entry.next, sourcing_kit: { ...entry.kit, jobId: role.id }, sourcing_revision: entry.revision,
    };
    const existing = byId.get(entry.id);
    if (existing) {
      const kit = SafeKit.safeParse(existing.sourcing_kit);
      if (existing.user_id !== DEMO_USER_ID || !kit.success || kit.data.jobId !== role.id ||
        (existing.sourcing_revision ?? 0) > entry.revision) continue;
      db.patchRows("applications", { id: entry.id, user_id: DEMO_USER_ID }, patch);
    } else {
      db.seed("applications", [{
        ...patch, id: entry.id, user_id: DEMO_USER_ID, company_id: role.company_id, company: role.company, role: role.title,
        sector_id: null, jd_extract: null, jd_raw: null, cv_id: null, referral_contact_id: null,
        external_ref: "sourced:" + role.id, apply_url: safePostingUrl(role.url),
      }]);
    }
  }
  for (const [role, decision] of journal.decisions) {
    const sample = byRole.get(role);
    if (sample) db.patchRows("sourced_jobs", { id: sample.id, user_id: DEMO_USER_ID }, { sourcing_decision: decision });
  }
  db.patchRows("profiles", { user_id: DEMO_USER_ID }, { sourcing_evidence: journal.evidence });
  versions.set(db, journal.updated);
}
