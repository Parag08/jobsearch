/**
 * How the Bank tab presents the bullet bank (DESIGN.md section 5, Bank): strength as three
 * coloured bands, tags in sentence case without repeats, deferred nudges as plain to-dos,
 * and the edit form read back into a point. Pure, so the page and the actions stay thin.
 */
import { familyLabel } from "../pipeline-display";
import { capStrength, needsMetric } from "../onboarding";
import type { Nudge } from "../onboarding/nudges";
import type { BulletVariant } from "../types";

export const DEFAULT_STRENGTH = 3;
export const MAX_SKILL_CHIPS = 4;
const QUOTE_CHARS = 70;

export type StrengthBand = "strong" | "solid" | "weak";

export const BAND_LABEL: Record<StrengthBand, string> = { strong: "Strong", solid: "Solid", weak: "Weak" };

/** 4-5 strong (green), 3 solid (teal), 1-2 weak (orange: needs attention). */
export function strengthBand(strength: number | undefined): StrengthBand {
  const s = strength ?? DEFAULT_STRENGTH;
  if (s >= 4) return "strong";
  if (s === 3) return "solid";
  return "weak";
}

/** What a point is worth on the page: its own score, capped at 2 while it has no number. */
export function effectiveStrength(b: { text: string; strength?: number }): number {
  return capStrength(b.strength ?? DEFAULT_STRENGTH, needsMetric(b.text));
}

export function strengthMix(bullets: { strength?: number }[]): Record<StrengthBand, number> {
  const mix = { strong: 0, solid: 0, weak: 0 };
  for (const b of bullets) mix[strengthBand(b.strength)] += 1;
  return mix;
}

/** The family as the one coloured tag, then up to `max` distinct skills in sentence case. */
export function chipsFor(b: { roleFamily: string; skills: string[] }, max = MAX_SKILL_CHIPS) {
  const family = familyLabel(b.roleFamily);
  const seen = new Set([family.toLowerCase()]);
  const all: string[] = [];
  for (const s of b.skills) {
    const label = familyLabel(s);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    all.push(label);
  }
  return { family, skills: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** Recent = the dates mention this year or last, or say present/now. */
export function isRecentRole(dates: string | null, thisYear: number): boolean {
  if (!dates) return false;
  return dates.includes(String(thisYear)) || dates.includes(String(thisYear - 1)) || /present|now/i.test(dates);
}

export interface TodoItem {
  key: string;
  text: string;
  /** The role the to-do belongs to, when it has one. */
  where: string | null;
  /** In-page anchor of the role or point. */
  href: string | null;
}

const quote = (text: string) => {
  if (text.length <= QUOTE_CHARS) return `“${text}”`;
  const cut = text.slice(0, QUOTE_CHARS);
  const space = cut.lastIndexOf(" ");
  return `“${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, "")}…”`;
};

const BANK_LEVEL: Partial<Record<Nudge["kind"], string>> = {
  "missing-target": "Choose the kinds of role you're aiming for",
  "missing-work-authorisation": "Say whether you need visa sponsorship",
  "missing-languages": "Add the languages you speak",
  "missing-summary": "Write a one-line summary of yourself",
};

/** Nudges as sentences. A nudge whose role or point has gone is dropped, never shown as an id. */
export function todoItems(
  nudges: Nudge[],
  ctx: {
    roles: Record<string, { name: string; points: number }>;
    points: Record<string, { text: string; role: string }>;
    pointsPerRole: number;
  },
): TodoItem[] {
  const out: TodoItem[] = [];
  for (const n of nudges) {
    if (n.kind === "thin-role") {
      const r = n.ref ? ctx.roles[n.ref] : undefined;
      if (!r) continue;
      const k = Math.max(1, ctx.pointsPerRole - r.points);
      out.push({ key: `thin-role-${n.ref}`, text: `Add ${k} more point${k === 1 ? "" : "s"} to ${r.name}`, where: r.name, href: `#role-${n.ref}` });
    } else if (n.kind === "needs-metric") {
      const p = n.ref ? ctx.points[n.ref] : undefined;
      if (!p) continue;
      out.push({ key: `needs-metric-${n.ref}`, text: `Add a number to ${quote(p.text)}`, where: p.role, href: `#point-${n.ref}` });
    } else {
      const text = BANK_LEVEL[n.kind];
      if (text) out.push({ key: n.kind, text, where: null, href: null });
    }
  }
  return out;
}

export interface PointInput {
  text: string;
  strength: number;
  roleFamily: string;
  skills: string[];
  variants: BulletVariant[];
}

export type Parsed = { ok: true; value: PointInput } | { ok: false; error: string };

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** The editor's form back into a point: trimmed, validated, strength capped while it has no number. */
export function parsePointForm(f: FormData): Parsed {
  const text = String(f.get("text") ?? "").trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "Write the point before saving." };

  const strength = Number(f.get("strength"));
  if (!Number.isInteger(strength) || strength < 1 || strength > 5) return { ok: false, error: "Strength must be 1 to 5." };

  const roleFamily = slug(String(f.get("roleFamily") ?? "")) || "general";

  const skills: string[] = [];
  for (const raw of String(f.get("skills") ?? "").split(/[,\n]/)) {
    const s = slug(raw);
    if (s && !skills.includes(s)) skills.push(s);
  }

  const labels = f.getAll("variantLabel").map(String);
  const texts = f.getAll("variantText").map(String);
  const variants: BulletVariant[] = [];
  texts.forEach((t, i) => {
    const vt = t.trim();
    if (vt) variants.push({ label: (labels[i] ?? "").trim() || `variant ${variants.length + 1}`, text: vt });
  });

  return { ok: true, value: { text, strength: capStrength(strength, needsMetric(text)), roleFamily, skills, variants } };
}

export interface CvUse {
  sent: number;
  unsent: number;
}

/** Which tailored CVs include each point: sent ones keep their snapshot, unsent ones follow the bank. */
export function cvUsage(cvs: { bulletIds: string[]; sentAt?: string | null }[]): Record<string, CvUse> {
  const out: Record<string, CvUse> = {};
  for (const cv of cvs) {
    for (const id of new Set(cv.bulletIds)) {
      const u = (out[id] ??= { sent: 0, unsent: 0 });
      if (cv.sentAt) u.sent += 1;
      else u.unsent += 1;
    }
  }
  return out;
}

const plural = (n: number) => (n === 1 ? "" : "s");

/**
 * The line the delete confirmation shows. A CV file already made or sent keeps the point; any
 * CV built from now on (a re-download included, since export reads the bank) leaves it out.
 */
export function usageNote(u: CvUse | undefined): string {
  const n = (u?.sent ?? 0) + (u?.unsent ?? 0);
  if (!u || n === 0) return "No CV uses this point yet.";
  const sent = u.sent > 0 ? ` (${u.sent} already sent)` : "";
  return `It's in ${n} CV${plural(n)}${sent}. Copies already made or sent keep it; those CVs leave it out from now on.`;
}
