import { snapshotCv } from "../freeze";
import { norm, type Bullet, type Project } from "../types";
import type { Profile, StoredApplicationCv } from "../repos/rows";

/**
 * The renderable CV (DESIGN §2 "Export"): one structure both DOCX and PDF draw
 * from, so the two formats cannot drift. Pure - no I/O.
 *
 * Text comes from the frozen snapshot once the CV was sent, otherwise from the
 * live recipe resolved exactly as freeze would (override > variant > base).
 */
export interface ResolvedRole {
  title: string;
  dates: string;
  bullets: string[];
}

export interface ResolvedOrg {
  org: string;
  blurb: string;
  roles: ResolvedRole[];
}

export interface ResolvedCv {
  name: string;
  contactLines: string[];
  summaryLine: string;
  experience: ResolvedOrg[];
  education: ResolvedOrg[];
  extras: { label: string; text: string }[];
}

export function resolveCv(cv: StoredApplicationCv, projects: Project[], profile: Profile): ResolvedCv {
  const bank: Record<string, Bullet> = Object.fromEntries(projects.flatMap((p) => p.bullets).map((b) => [b.id, b]));
  const snapshot = cv.sentSnapshot ?? snapshotCv(cv, bank);
  const textOf = new Map(
    snapshot.bullets.filter((b) => b.text !== null).map((b) => [b.bulletId, b.text as string]),
  );

  const schools = new Set(
    profile.networks.map((n) => (n && typeof n === "object" && "name" in n ? norm(String(n.name)) : "")).filter(Boolean),
  );

  // Bank order (experience before education, as imported), bullets in bank order per role.
  const experience: ResolvedOrg[] = [];
  const education: ResolvedOrg[] = [];
  for (const p of projects) {
    const isSchool = schools.has(norm(p.org));
    const bullets = p.bullets.filter((b) => textOf.has(b.id)).map((b) => textOf.get(b.id)!);
    if (!isSchool && bullets.length === 0) continue;
    const list = isSchool ? education : experience;
    let entry = list.find((e) => e.org === p.org);
    if (!entry) {
      entry = { org: p.org, blurb: p.narrative, roles: [] };
      list.push(entry);
    }
    entry.roles.push({ title: p.role ?? p.name, dates: p.dates ?? "", bullets });
  }

  const extras = profile.cvExtras.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { label, text } = x as { label?: unknown; text?: unknown };
    return typeof label === "string" && typeof text === "string" && text.trim() ? [{ label, text }] : [];
  });

  return {
    name: profile.displayName,
    contactLines: profile.contactLines,
    summaryLine: snapshot.summaryLine,
    experience,
    education,
    extras,
  };
}
