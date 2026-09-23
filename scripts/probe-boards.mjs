#!/usr/bin/env node
/**
 * Board discovery for the Singapore sourcing pipeline (DESIGN.md section 4, step 2).
 *
 * Reads data/singapore/companies.json, works out which companies expose a public,
 * keyless JSON board, and writes the verified `ats` / `token` back into the file.
 * A company whose board cannot be found is left as "unknown" - the signal that it
 * needs the HTML route or a manual check, never a silent miss.
 *
 * Verification is real: a token counts only when the endpoint answers AND returns
 * at least one posting. SmartRecruiters in particular returns HTTP 200 with an
 * empty list for company ids that do not exist, so status alone proves nothing.
 *
 *   node scripts/probe-boards.mjs            # probe every company
 *   node scripts/probe-boards.mjs --only Grab,Nium
 *
 * Keyless and free (rule 5). Runs a small concurrency limit to stay polite.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(root, "data/singapore/companies.json");
const CONCURRENCY = 6;
const TIMEOUT_MS = 12000;

/** Candidate board tokens for a company name, most likely first. */
function tokens(company) {
  const base = company.toLowerCase().replace(/&/g, "and");
  const alnum = base.replace(/[^a-z0-9]/g, "");
  const dashed = base.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const firstWord = base.split(/[^a-z0-9]+/).filter(Boolean)[0] ?? alnum;
  const noSuffix = alnum.replace(/(group|bank|singapore|international|company|payments|technologies)$/g, "");
  return [...new Set([alnum, dashed, firstWord, noSuffix].filter((t) => t && t.length > 1))];
}

const ENDPOINTS = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
  smartrecruiters: (t) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(t)}/postings?limit=1`,
};

/** How many postings a payload actually carries - 0 means the token is wrong. */
function countPostings(ats, data) {
  if (!data) return 0;
  if (ats === "greenhouse") return Array.isArray(data.jobs) ? data.jobs.length : 0;
  if (ats === "lever") return Array.isArray(data) ? data.length : 0;
  if (ats === "ashby") return Array.isArray(data.jobs) ? data.jobs.length : 0;
  if (ats === "smartrecruiters") return Number(data.totalFound ?? 0);
  return 0;
}

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const alnum = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Registrable-ish domain: keeps gov.sg / com.sg style suffixes intact. */
function domainOf(raw) {
  try {
    const h = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    const p = h.split(".");
    const twoPart = /^(gov|com|co|org|net|edu)$/.test(p[p.length - 2] ?? "");
    return p.slice(twoPart ? -3 : -2).join(".");
  } catch {
    return null;
  }
}

/** First posting's apply/job URL, which often reveals the real employer's domain. */
function firstJobUrl(ats, d) {
  if (ats === "greenhouse") return d?.jobs?.[0]?.absolute_url ?? null;
  if (ats === "lever") return d?.[0]?.hostedUrl ?? null;
  if (ats === "ashby") return d?.jobs?.[0]?.jobUrl ?? null;
  if (ats === "smartrecruiters") return d?.content?.[0]?.ref ?? null;
  return null;
}

/** Employer name the board itself reports, where the ATS provides one. */
function boardName(ats, d) {
  if (ats === "smartrecruiters") return d?.content?.[0]?.company?.name ?? null;
  return null;
}

/**
 * Does this board actually belong to this company?
 *
 * A token that merely RETURNS postings proves nothing: "mas" is an Illinois HVAC
 * firm, "edb" is EnterpriseDB, "sia" is Sia Partners and "bcg" is somebody's test
 * board. All four answered with real jobs. Require corroboration from the board's
 * own name or the employer domain in its job links, and treat short tokens as
 * guilty until proven innocent.
 */
function corroborate(entry, ats, token, data) {
  const want = alnum(entry.company);
  const got = alnum(boardName(ats, data));
  if (got) {
    // Fragment matches are how "Sia" passes for "SIA Engineering" - demand the
    // two names be comparable in length, not merely overlapping.
    const overlap = got.includes(want) || want.includes(got);
    const ratio = Math.min(got.length, want.length) / Math.max(got.length, want.length);
    if (overlap && ratio >= 0.6) return "board-name";
  }
  const careers = domainOf(entry.careersUrl);
  const job = domainOf(firstJobUrl(ats, data));
  if (careers && job && careers === job) return "employer-domain";

  // No external signal: accept only a long, unambiguous token that matches the name.
  if (token.length >= 5 && (want === token || want.startsWith(token) || token.startsWith(want))) {
    return "token-name";
  }
  return null;
}

async function probe(entry) {
  const rejected = [];
  for (const [ats, endpoint] of Object.entries(ENDPOINTS)) {
    for (const token of tokens(entry.company)) {
      const data = await getJson(endpoint(token));
      const n = countPostings(ats, data);
      if (n === 0) continue;
      const via = corroborate(entry, ats, token, data);
      if (via) return { ats, token, openings: n, via, rejected };
      rejected.push(`${ats}/${token} (${n} jobs, wrong employer)`);
    }
  }
  return { ats: "unknown", token: null, openings: 0, via: null, rejected };
}

async function pool(items, worker, limit) {
  const out = new Array(items.length);
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

const doc = JSON.parse(readFileSync(FILE, "utf8"));
const onlyArg = process.argv.find((a) => a.startsWith("--only"));
const only = onlyArg ? new Set(onlyArg.split("=")[1]?.split(",") ?? process.argv[process.argv.indexOf(onlyArg) + 1]?.split(",") ?? []) : null;
const targets = doc.companies.filter((c) => !only || only.has(c.company));

console.log(`Probing ${targets.length} companies...\n`);
// `confirmed: true` means a human checked this board and it is right. Corroboration
// is deliberately strict, so it produces false negatives as well as catching frauds -
// lever/nium is genuinely Nium (its postings name Instarem, Nium's subsidiary) but
// nothing in the payload says so. Confirmed entries are kept, never re-probed.
const results = await pool(
  targets,
  async (c) =>
    c.confirmed && c.ats && c.ats !== "unknown"
      ? { c, r: { ats: c.ats, token: c.token, openings: -1, via: "confirmed", rejected: [] } }
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

const bad = results.flatMap(({ c, r }) => (r.rejected ?? []).map((x) => `  ${c.company.padEnd(24)} rejected ${x}`));
if (bad.length) console.log(`\nAnswered but belongs to someone else:\n${bad.join("\n")}`);

console.log(`\nNo public JSON board (HTML route or manual):`);
for (const { c, r } of results) if (r.ats === "unknown") console.log(`  ${c.type.padEnd(22)} ${c.company}`);

writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`\n${found} of ${targets.length} have a public JSON board. Written to data/singapore/companies.json`);
