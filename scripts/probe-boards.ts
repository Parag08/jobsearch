/**
 * Board discovery for the sourcing pipeline (DESIGN.md section 4, step 2).
 *
 *   npm run boards:probe
 *   npm run boards:probe -- --only Grab,Nium
 *
 * Reads data/singapore/companies.json, finds which companies expose a public,
 * keyless JSON board, and writes the verified `ats` / `token` back. A company whose
 * board cannot be verified is left "unknown" - the signal for the HTML route or a
 * manual check, never a silent miss.
 *
 * The ownership check lives in lib/watchlist/ats.ts (corroborateBoard), not here:
 * it is domain logic, it is what stands between this pipeline and four different
 * wrong employers, and it belongs somewhere `npm test` can see it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { corroborateBoard, type BoardProof, type Corroboration } from "../lib/watchlist/ats";
import { COMPANY_SEED_PATH, type CompanySeedEntry } from "../lib/companies/types";

const CONCURRENCY = 6;
const TIMEOUT_MS = 12000;

type Ats = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

const ENDPOINTS: Record<Ats, (t: string) => string> = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
  smartrecruiters: (t) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(t)}/postings?limit=1`,
};

/** Candidate board tokens for a company name, most likely first. */
function tokens(company: string): string[] {
  const base = company.toLowerCase().replace(/&/g, "and");
  const alnum = base.replace(/[^a-z0-9]/g, "");
  const dashed = base.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const firstWord = base.split(/[^a-z0-9]+/).filter(Boolean)[0] ?? alnum;
  const noSuffix = alnum.replace(/(group|bank|singapore|international|company|payments|technologies)$/g, "");
  return [...new Set([alnum, dashed, firstWord, noSuffix].filter((t) => t && t.length > 1))];
}

/** How many postings a payload carries. Zero means the token is wrong. */
function countPostings(ats: Ats, d: any): number {
  if (!d) return 0;
  if (ats === "greenhouse") return Array.isArray(d.jobs) ? d.jobs.length : 0;
  if (ats === "lever") return Array.isArray(d) ? d.length : 0;
  if (ats === "ashby") return Array.isArray(d.jobs) ? d.jobs.length : 0;
  return Number(d.totalFound ?? 0);
}

/** What the payload reveals about who owns the board. */
function proofOf(ats: Ats, d: any): BoardProof {
  if (ats === "greenhouse") return { jobUrl: d?.jobs?.[0]?.absolute_url ?? null };
  if (ats === "lever") return { jobUrl: d?.[0]?.hostedUrl ?? null };
  if (ats === "ashby") return { jobUrl: d?.jobs?.[0]?.jobUrl ?? null };
  return { boardName: d?.content?.[0]?.company?.name ?? null, jobUrl: d?.content?.[0]?.ref ?? null };
}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ProbeResult {
  ats: Ats | "unknown";
  token: string | null;
  openings: number;
  via: Corroboration | "confirmed";
  rejected: string[];
}

async function probe(entry: CompanySeedEntry): Promise<ProbeResult> {
  const rejected: string[] = [];
  for (const ats of Object.keys(ENDPOINTS) as Ats[]) {
    for (const token of tokens(entry.company)) {
      const data = await getJson(ENDPOINTS[ats](token));
      const n = countPostings(ats, data);
      if (n === 0) continue;
      const via = corroborateBoard(entry.company, entry.careersUrl, token, proofOf(ats, data));
      if (via) return { ats, token, openings: n, via, rejected };
      rejected.push(`${ats}/${token} (${n} jobs, wrong employer)`);
    }
  }
  return { ats: "unknown", token: null, openings: 0, via: null, rejected };
}

async function pool<T, R>(items: T[], worker: (t: T) => Promise<R>, limit: number): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i]);
      }
    }),
  );
  return out;
}

const FILE = resolve(COMPANY_SEED_PATH);
const doc = JSON.parse(readFileSync(FILE, "utf8")) as { companies: CompanySeedEntry[]; _readme?: string[] };

const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? new Set((process.argv[onlyIdx + 1] ?? "").split(",")) : null;
const targets = doc.companies.filter((c) => !only || only.has(c.company));

console.log(`Probing ${targets.length} companies...\n`);
const results = await pool(
  targets,
  async (c) =>
    c.confirmed && c.ats && c.ats !== "unknown"
      ? { c, r: { ats: c.ats as Ats, token: c.token ?? null, openings: -1, via: "confirmed" as const, rejected: [] } }
      : { c, r: await probe(c) },
  CONCURRENCY,
);

const today = new Date().toISOString().slice(0, 10);
let found = 0;
for (const { c, r } of results) {
  c.ats = r.ats;
  c.token = r.token;
  c.probed = today;
  if (r.ats !== "unknown") {
    found++;
    console.log(`  ${r.ats.padEnd(16)} ${c.company.padEnd(24)} ${String(r.openings).padStart(4)} openings  (${r.token}, via ${r.via})`);
  }
}

const bad = results.flatMap(({ c, r }) => r.rejected.map((x) => `  ${c.company.padEnd(24)} rejected ${x}`));
if (bad.length) console.log(`\nAnswered but belongs to someone else:\n${bad.join("\n")}`);

console.log(`\nNo public JSON board (HTML route or manual):`);
for (const { c, r } of results) if (r.ats === "unknown") console.log(`  ${c.type.padEnd(22)} ${c.company}`);

writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`\n${found} of ${targets.length} have a public JSON board. Written to ${COMPANY_SEED_PATH}`);
