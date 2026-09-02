import { z } from "zod";
import type { CvDiff } from "../cv-diff";
import type { Profile, StoredApplicationCv } from "../repos/rows";
import {
  ApplicationSchema,
  BulletSchema,
  MasterCvSchema,
  ProjectSchema,
  SectorNodeSchema,
  norm,
  type Application,
  type Bullet,
  type JdExtract,
  type MasterCv,
  type Project,
  type SectorNode,
} from "../types";

/**
 * Import of the CVbuilder workspace (data/cvbuilder/) into JobPilot's data model.
 *
 * CVbuilder is the hand-refined source of truth for Parag's CV content: a pool of
 * points (bullets with re-angled variants), the roles they sit under, role-family
 * archetypes with their base CVs, and the real applications built from them.
 * This module is a PURE transform - the script at scripts/import-cvbuilder.ts does
 * the file I/O and turns the result into supabase/seed.sql.
 *
 * Mapping, in one line each:
 *   profile.json role     -> project (its points become that project's bullets)
 *   points.json  point    -> bullet (variants + strength carried through)
 *   archetype    <id>     -> master_cv for role family <id>, from its base CV selection
 *   master/generic.json   -> master_cv for role family "general" (v1 / v2)
 *   applications/<x>.json -> application + application_cv (the CV actually sent)
 *   applications' JDs     -> sector nodes, one per (role family, geography)
 *
 * Nothing here calls an LLM (token rule #2): JD skills and keywords come from
 * matching data/cvbuilder/taxonomy.json - the user's own controlled vocabulary -
 * against the JD text, exactly the way CVbuilder's offline scorer does it. When
 * process-jd later re-parses a JD with a real extractor, it overwrites this.
 */

// ---- the CVbuilder file shapes (unknown fields are tolerated) -----------------

const CvbRoleSchema = z.object({ id: z.string(), title: z.string(), dates: z.string().nullish() });
const CvbOrgSchema = z.object({
  id: z.string(),
  org: z.string(),
  location: z.string().nullish(),
  blurb: z.string().nullish(),
  roles: z.array(CvbRoleSchema).default([]),
});
export const CvbProfileSchema = z.object({
  name: z.object({ first: z.string(), last: z.string() }),
  contactLines: z.array(z.string()).default([]),
  education: z.array(CvbOrgSchema).default([]),
  experience: z.array(CvbOrgSchema).default([]),
  additional: z
    .array(z.object({ id: z.string(), label: z.string(), text: z.string() }).passthrough())
    .default([]),
});

const CvbVariantSchema = z.object({ label: z.string(), text: z.string() });
export const CvbPointsSchema = z.object({
  points: z.array(
    z.object({
      id: z.string(),
      roleId: z.string(),
      text: z.string(),
      variants: z.array(CvbVariantSchema).default([]),
      tags: z.array(z.string()).default([]),
      strength: z.number().int().min(1).max(5).default(3),
      status: z.string().default("active"),
      inMaster: z.boolean().default(false),
    }),
  ),
});

export const CvbTaxonomySchema = z.object({
  families: z.record(z.string(), z.array(z.string())).default({}),
  tags: z.record(z.string(), z.array(z.string())),
});

export const CvbArchetypesSchema = z.object({
  archetypes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      targetRoles: z.string().default(""),
      pin: z.array(z.string()).default([]),
      exclude: z.array(z.string()).default([]),
      variants: z.record(z.string(), z.string()).default({}),
      evidence: z
        .array(
          z.object({
            id: z.string(),
            kind: z.string(),
            text: z.string().default(""),
            fromApplication: z.string().nullish(),
          }),
        )
        .default([]),
    }),
  ),
});

export const CvbApplicationSchema = z.object({
  id: z.string(),
  company: z.string().default(""),
  role: z.string().default(""),
  jd: z.string().default(""),
  updatedAt: z.string().nullish(),
  generatedFrom: z.object({ archetype: z.string() }).passthrough().nullish(),
  selection: z
    .object({
      points: z
        .array(
          z.object({
            pointId: z.string(),
            variant: z.string().nullish(),
            overrideText: z.string().nullish(),
          }),
        )
        .default([]),
    })
    .default({ points: [] }),
});

export type CvbProfile = z.infer<typeof CvbProfileSchema>;
export type CvbTaxonomy = z.infer<typeof CvbTaxonomySchema>;

/** The raw contents of data/cvbuilder/ - parsed and validated inside importCvbuilder. */
export interface CvbSource {
  profile: unknown;
  points: unknown;
  taxonomy: unknown;
  archetypes: unknown;
  applications: unknown[];
}

// ---- what the import produces --------------------------------------------------

export interface ImportedApplication {
  application: Application;
  /** Audit-only copy of the posting; never re-enters a prompt (token rule #1). */
  jdRaw: string;
  /** The CV that was actually built for this application, as a diff from its master. */
  cv: StoredApplicationCv | null;
}

export interface ImportedWorkspace {
  profile: Profile;
  projects: Project[];
  masterCvs: MasterCv[];
  sectors: SectorNode[];
  applications: ImportedApplication[];
  /** Anything dropped or guessed - printed by the import script, not swallowed. */
  warnings: string[];
}

export interface ImportOptions {
  /** auth.users id this workspace belongs to. */
  userId: string;
  /** ISO date used wherever CVbuilder has no timestamp of its own. */
  today: string;
}

/** Role family for bullets and CVs no archetype claims. */
const GENERAL = "general";
/** Base CVs, the master and the hand-to-anyone CV are not applications. */
const NON_APPLICATION_IDS = new Set(["master", "generic"]);
const SENIORITIES = [
  "intern",
  "graduate",
  "associate",
  "senior",
  "staff",
  "principal",
  "lead",
  "head",
  "manager",
  "director",
  "vp",
  "partner",
];

// ---- deterministic ids ------------------------------------------------------------

/**
 * A stable uuid for a CVbuilder slug, so re-importing updates rows instead of
 * duplicating them and master CVs can reference bullets before either is inserted.
 * Four FNV-1a passes with different offset bases fill the 128 bits; the version
 * nibble is 8 ("custom", RFC 9562) because this is a hash, not a random uuid.
 */
export function stableId(kind: string, slug: string): string {
  const key = `jobpilot:${kind}:${slug}`;
  const bases = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const hex = bases
    .map((base) => {
      let h = base >>> 0;
      for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h.toString(16).padStart(8, "0");
    })
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

// ---- lexical matching against the user's own taxonomy --------------------------------

export interface TagHits {
  /** Taxonomy tags present in the text, in taxonomy order. */
  tags: string[];
  /** The literal phrases that matched, same order. */
  phrases: string[];
}

/**
 * Which taxonomy tags a piece of text demands. Multi-word phrases match as
 * substrings, single words on a word boundary - the rule taxonomy.json documents.
 */
export function detectTags(text: string, taxonomy: unknown): TagHits {
  const { tags: vocabulary } = CvbTaxonomySchema.parse(taxonomy);
  const haystack = norm(text);
  const tags: string[] = [];
  const phrases: string[] = [];
  for (const [tag, keywords] of Object.entries(vocabulary)) {
    let hit = false;
    for (const keyword of keywords) {
      const k = norm(keyword);
      const found = k.includes(" ")
        ? haystack.includes(k)
        : new RegExp(`\\b${escapeRegExp(k)}\\b`).test(haystack);
      if (found) {
        hit = true;
        phrases.push(k);
      }
    }
    if (hit) tags.push(tag);
  }
  return { tags, phrases };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(norm(word))}\\b`).test(norm(haystack));
}

// ---- the import ---------------------------------------------------------------------

export function importCvbuilder(src: CvbSource, opts: ImportOptions): ImportedWorkspace {
  const warnings: string[] = [];
  const profileSrc = CvbProfileSchema.parse(src.profile);
  const { points } = CvbPointsSchema.parse(src.points);
  const { archetypes } = CvbArchetypesSchema.parse(src.archetypes);
  const taxonomy = CvbTaxonomySchema.parse(src.taxonomy);
  const files = src.applications.map((a) => CvbApplicationSchema.parse(a));
  const byFileId = new Map(files.map((f) => [f.id, f]));

  // -- bullets: active points only, grouped under the role they belong to ------------
  const active = points.filter((p) => {
    if (p.status === "active") return true;
    warnings.push(`point "${p.id}" skipped: status is "${p.status}", not active`);
    return false;
  });
  const roleFamilyOf = bulletRoleFamilies(active, archetypes, byFileId);
  const bulletsByRole = new Map<string, Bullet[]>();
  const bulletIdByPoint = new Map<string, string>();
  for (const p of active) {
    const bullet = BulletSchema.parse({
      id: stableId("bullet", p.id),
      projectId: stableId("project", p.roleId),
      roleFamily: roleFamilyOf.get(p.id) ?? GENERAL,
      text: p.text,
      skills: p.tags,
      variants: p.variants,
      strength: p.strength,
    });
    bulletIdByPoint.set(p.id, bullet.id);
    const list = bulletsByRole.get(p.roleId) ?? [];
    list.push(bullet);
    bulletsByRole.set(p.roleId, list);
  }

  // -- projects: one per CV role, experience before education ------------------------
  const projects: Project[] = [];
  for (const org of [...profileSrc.experience, ...profileSrc.education]) {
    for (const role of org.roles) {
      const bullets = bulletsByRole.get(role.id) ?? [];
      if (bullets.length === 0) warnings.push(`role "${role.id}" (${org.org}) has no points`);
      projects.push(
        ProjectSchema.parse({
          id: stableId("project", role.id),
          name: `${org.org} - ${role.title}`,
          org: org.org,
          dates: role.dates ?? null,
          role: role.title,
          narrative: org.blurb ?? "",
          outcomes: [],
          skills: [...new Set(bullets.flatMap((b) => b.skills))].sort(),
          sectorTags: [],
          bullets,
        }),
      );
    }
  }

  // -- profile ------------------------------------------------------------------------
  const displayName = `${profileSrc.name.first} ${titleCase(profileSrc.name.last)}`;
  const geoTokens = geographyTokens(profileSrc);
  const authLine = profileSrc.additional.find((a) => /authoris|nationality|visa/i.test(a.label));
  const profile: Profile = {
    userId: opts.userId,
    displayName,
    targetGeos: geoTokens.filter((g) => authLine && containsWord(authLine.text, g)),
    roleFamilies: archetypes.map((a) => a.id),
    networks: profileSrc.education.map((e) => ({
      name: e.org,
      program: e.roles[0]?.title ?? "",
      location: e.location ?? "",
    })),
    visaContext: authLine?.text ?? null,
    premiumLlmBudgetUsdMonth: 0,
    contactLines: profileSrc.contactLines,
    cvExtras: profileSrc.additional,
  };

  // -- master CVs: one per archetype base CV, plus master/generic as "general" ---------
  const eduSuffix = profileSrc.education[0]
    ? ` | ${profileSrc.education[0].org} ${profileSrc.education[0].roles[0]?.title ?? ""}`.trimEnd()
    : "";
  const resolveSelection = (fileId: string): { ids: string[]; variants: Record<string, string>; overrides: Record<string, string> } => {
    const file = byFileId.get(fileId);
    const ids: string[] = [];
    const variants: Record<string, string> = {};
    const overrides: Record<string, string> = {};
    if (!file) {
      warnings.push(`selection source "${fileId}" not found in data/cvbuilder/applications`);
      return { ids, variants, overrides };
    }
    for (const sel of file.selection.points) {
      const id = bulletIdByPoint.get(sel.pointId);
      if (!id) {
        warnings.push(`"${fileId}" selects unknown or inactive point "${sel.pointId}"`);
        continue;
      }
      ids.push(id);
      if (sel.variant) variants[id] = sel.variant;
      if (sel.overrideText) overrides[id] = sel.overrideText;
    }
    return { ids, variants, overrides };
  };

  const masterCvs: MasterCv[] = archetypes.map((a) =>
    MasterCvSchema.parse({
      id: stableId("master-cv", a.id),
      roleFamily: a.id,
      summaryLine: `${displayName} - ${a.label}${eduSuffix}`,
      bulletIds: resolveSelection(`archetype-${a.id}`).ids,
      version: 1,
    }),
  );
  // master.json is the fidelity reference, generic.json its newer hand-to-anyone
  // descendant; both are the "general" family, and getLatestMasterCv picks generic.
  for (const [fileId, version] of [
    ["master", 1],
    ["generic", 2],
  ] as const) {
    if (!byFileId.has(fileId)) continue;
    masterCvs.push(
      MasterCvSchema.parse({
        id: stableId("master-cv", fileId),
        roleFamily: GENERAL,
        summaryLine: `${displayName}${eduSuffix}`,
        bulletIds: resolveSelection(fileId).ids,
        version,
      }),
    );
  }
  const masterByFamily = new Map(masterCvs.filter((m) => m.version === 1 || m.roleFamily !== GENERAL).map((m) => [m.roleFamily, m]));
  const generalMaster = masterCvs.find((m) => m.roleFamily === GENERAL);

  // -- applications: the real ones only ------------------------------------------------
  const familyByApplication = new Map<string, string>();
  for (const a of archetypes) {
    for (const e of a.evidence) {
      if (e.fromApplication) familyByApplication.set(e.fromApplication, a.id);
    }
  }
  const labelByFamily = new Map(archetypes.map((a) => [a.id, a.label]));
  const bank = projects.flatMap((p) => p.bullets);

  const applications: ImportedApplication[] = [];
  const sectorAcc = new Map<string, { path: string[]; skills: Record<string, number>; companies: Set<string>; titles: Set<string>; jdCount: number }>();

  for (const file of files) {
    if (file.id.startsWith("archetype-") || NON_APPLICATION_IDS.has(file.id)) continue;
    if (!file.company && !file.jd) {
      warnings.push(`"${file.id}" has neither a company nor a JD - skipped`);
      continue;
    }
    const linkedFamily = familyByApplication.get(file.id) ?? file.generatedFrom?.archetype;
    const roleFamily = linkedFamily ?? inferRoleFamily(file, archetypes, taxonomy) ?? GENERAL;
    if (!linkedFamily) {
      warnings.push(
        `"${file.id}": no archetype claims this posting - role family guessed as "${roleFamily}" from taxonomy overlap. Add it as evidence in archetypes.json to fix it.`,
      );
    }
    const hits = detectTags(`${file.role} ${file.jd}`, taxonomy);
    const location = geoTokens.find((g) => containsWord(`${file.role} ${file.jd}`, g)) ?? profile.targetGeos[0] ?? null;
    const label = labelByFamily.get(roleFamily) ?? titleCase(roleFamily.replace(/-/g, " "));
    const sectorPath = [label, ...(location ? [location] : [])];
    const sectorId = stableId("sector", sectorPath.join(">"));

    const jdExtract: JdExtract = {
      company: file.company,
      role: file.role,
      roleFamily,
      sectorPath,
      skills: hits.tags,
      keywords: [...new Set(hits.phrases)],
      seniority: SENIORITIES.find((s) => containsWord(file.role, s)) ?? null,
      visaNote: sentenceAbout(file.jd, /visa|sponsor|eligib|work pass|employment pass/i),
      location,
    };

    const savedAt = (file.updatedAt ?? opts.today).slice(0, 10);
    const master = masterByFamily.get(roleFamily) ?? generalMaster ?? null;
    const selection = resolveSelection(file.id);
    let cv: StoredApplicationCv | null = null;
    if (master && selection.ids.length > 0) {
      cv = {
        id: stableId("application-cv", file.id),
        masterCvId: master.id,
        diff: diffFromMaster(master, selection, jdExtract, bank),
        bulletIds: selection.ids,
        summaryLine: `${master.summaryLine.replace(/\.$/, "")}, targeting ${file.role} at ${file.company}.`,
        filePath: null,
      };
    } else if (!master) {
      warnings.push(`"${file.id}": no master CV for role family "${roleFamily}" - CV not imported`);
    }

    applications.push({
      application: ApplicationSchema.parse({
        id: stableId("application", file.id),
        company: file.company,
        role: file.role,
        sectorId,
        stage: "saved",
        closedReason: null,
        jdExtract,
        cvVersionId: cv?.id ?? null,
        referralContactId: null,
        // CVbuilder never recorded whether these went out, so the import will not claim they did.
        nextAction: "Imported from CVbuilder - confirm whether this was submitted, then advance the stage",
        savedAt,
        appliedAt: null,
        updatedAt: file.updatedAt ?? `${opts.today}T00:00:00.000Z`,
      }),
      jdRaw: file.jd,
      cv,
    });

    const key = sectorPath.join(">");
    const acc = sectorAcc.get(key) ?? { path: sectorPath, skills: {}, companies: new Set<string>(), titles: new Set<string>(), jdCount: 0 };
    for (const s of hits.tags) acc.skills[s] = (acc.skills[s] ?? 0) + 1;
    if (file.company) acc.companies.add(file.company);
    if (file.role) acc.titles.add(file.role);
    acc.jdCount += 1;
    sectorAcc.set(key, acc);
  }

  const sectors: SectorNode[] = [...sectorAcc.entries()].map(([key, acc]) => {
    const companies = [...acc.companies];
    const top = Object.entries(acc.skills)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([s]) => s);
    return SectorNodeSchema.parse({
      id: stableId("sector", key),
      path: acc.path,
      skills: acc.skills,
      companies,
      titles: [...acc.titles],
      jdCount: acc.jdCount,
      summary: `${acc.path.join(" > ")}: ${acc.jdCount} JD(s) imported from CVbuilder${
        companies.length ? ` (${companies.join(", ")})` : ""
      }. Most-demanded: ${top.join(", ") || "not yet known"}.`,
    });
  });

  return { profile, projects, masterCvs, sectors, applications, warnings };
}

/**
 * Which role family "owns" each bullet. Only explicit editorial signal counts:
 * an archetype that PINS the point, or re-angles it with a forced variant, is
 * making a claim about it. A point every base CV carries belongs to no family in
 * particular and stays "general" - role family is only a relevance boost in
 * scoreBullet, so a neutral bullet is still scored everywhere.
 */
function bulletRoleFamilies(
  points: { id: string }[],
  archetypes: z.infer<typeof CvbArchetypesSchema>["archetypes"],
  byFileId: Map<string, z.infer<typeof CvbApplicationSchema>>,
): Map<string, string> {
  const owner = new Map<string, string>();
  for (const a of archetypes) {
    for (const id of a.pin) if (!owner.has(id)) owner.set(id, a.id);
  }
  for (const a of archetypes) {
    for (const id of Object.keys(a.variants)) if (!owner.has(id)) owner.set(id, a.id);
  }
  // A point only one base CV carries is that family's, even without an override.
  const selectors = new Map<string, string[]>();
  for (const a of archetypes) {
    for (const sel of byFileId.get(`archetype-${a.id}`)?.selection.points ?? []) {
      selectors.set(sel.pointId, [...(selectors.get(sel.pointId) ?? []), a.id]);
    }
  }
  for (const p of points) {
    const only = selectors.get(p.id);
    if (!owner.has(p.id) && only?.length === 1) owner.set(p.id, only[0]);
  }
  return owner;
}

/** No archetype claimed this posting: fall back to the family whose corpus reads most like it. */
function inferRoleFamily(
  file: z.infer<typeof CvbApplicationSchema>,
  archetypes: z.infer<typeof CvbArchetypesSchema>["archetypes"],
  taxonomy: CvbTaxonomy,
): string | null {
  const jdTags = new Set(detectTags(`${file.role} ${file.jd}`, taxonomy).tags);
  if (jdTags.size === 0) return null;
  let best: { id: string; score: number } | null = null;
  for (const a of archetypes) {
    const corpus = [a.label, a.targetRoles, ...a.evidence.map((e) => e.text)].join(" ");
    const tags = detectTags(corpus, taxonomy).tags;
    const score = tags.filter((t) => jdTags.has(t)).length;
    if (!best || score > best.score) best = { id: a.id, score };
  }
  return best && best.score > 0 ? best.id : null;
}

/**
 * The CV CVbuilder actually produced, expressed the way JobPilot stores one: a
 * diff from the family master. Keywords still obey the honesty rule - a JD phrase
 * is mirrored only where the bullet bank can back it.
 */
function diffFromMaster(
  master: MasterCv,
  selection: { ids: string[]; variants: Record<string, string>; overrides: Record<string, string> },
  jd: JdExtract,
  bank: Bullet[],
): CvDiff {
  const inMaster = new Set(master.bulletIds);
  const chosen = new Set(selection.ids);
  const evidence = new Set(bank.flatMap((b) => b.skills.map(norm)));
  const diff: CvDiff = {
    addBulletIds: selection.ids.filter((id) => !inMaster.has(id)),
    removeBulletIds: master.bulletIds.filter((id) => !chosen.has(id)),
    keywordsToMirror: jd.keywords
      .map(norm)
      .filter((kw) => evidence.has(kw) || bank.some((b) => norm(b.text).includes(kw))),
    summaryLine: `${master.summaryLine.replace(/\.$/, "")}, targeting ${jd.role} at ${jd.company}.`,
  };
  if (Object.keys(selection.variants).length > 0) diff.variants = selection.variants;
  if (Object.keys(selection.overrides).length > 0) diff.overrides = selection.overrides;
  return diff;
}

/** Every distinct place name the CV mentions - the vocabulary for "where is this role". */
function geographyTokens(profile: CvbProfile): string[] {
  const tokens = new Set<string>();
  for (const org of [...profile.experience, ...profile.education]) {
    for (const part of (org.location ?? "").split(/[/,]/)) {
      const t = part.trim();
      if (t) tokens.add(t);
    }
  }
  return [...tokens];
}

function sentenceAbout(text: string, re: RegExp): string | null {
  return text.split(/(?<=[.!?])\s+|\n+/).find((s) => re.test(s))?.trim() ?? null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}
