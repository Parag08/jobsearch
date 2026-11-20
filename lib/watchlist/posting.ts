import { detectAts, type AtsKind } from "./ats";
import { norm } from "../types";

/**
 * One posting's full text, read from its public board (docs/APPLY-FLOW.md step 3). Refresh
 * keeps only title, company and link; saving a role to the pipeline fetches the text here so
 * it can be read into what the role asks for. Pure: the I/O is the caller's.
 */

/** The keyless URL that returns one posting (Ashby has none, so its whole board). */
export function postingEndpoint(ats: Exclude<AtsKind, "unknown">, token: string, externalId: string): string {
  const t = encodeURIComponent(token);
  const id = encodeURIComponent(externalId);
  switch (ats) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${t}/jobs/${id}`;
    case "lever":
      return `https://api.lever.co/v0/postings/${t}/${id}`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${t}`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${t}/postings/${id}`;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)));
    return m;
  });
}

/** Board HTML (escaped or not) to plain text: paragraphs on their own lines, list items as "- ". */
export function htmlToText(input: string): string {
  // Greenhouse escapes its HTML once (sometimes twice for "&amp;"), so decode until stable.
  let s = input;
  for (let i = 0; i < 3 && /&(lt|gt|amp);/.test(s); i++) s = decode(s);
  if (!/<[a-z/][^>]*>/i.test(s)) return decode(s).trim();
  return decode(
    s
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|ul|ol|li|section)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The posting as one text, headed by its title and company (the JD reader looks for both),
 * or null when the board returned no description - the caller then asks for a paste.
 */
export function postingText(ats: AtsKind, payload: unknown, externalId: string, company: string): string | null {
  let title = "";
  const parts: string[] = [];
  const p = obj(payload);
  switch (ats) {
    case "greenhouse":
      title = str(p.title);
      parts.push(htmlToText(str(p.content)));
      break;
    case "lever":
      title = str(p.text);
      parts.push(str(p.descriptionPlain).trim() || htmlToText(str(p.description)));
      for (const l of Array.isArray(p.lists) ? p.lists : []) {
        const body = htmlToText(str(obj(l).content));
        if (body) parts.push([str(obj(l).text), body].filter(Boolean).join("\n"));
      }
      parts.push(str(p.additionalPlain).trim());
      break;
    case "ashby": {
      const job = (Array.isArray(p.jobs) ? p.jobs : []).map(obj).find((j) => String(j.id) === externalId);
      if (!job) return null;
      title = str(job.title);
      parts.push(str(job.descriptionPlain).trim() || htmlToText(str(job.descriptionHtml)));
      break;
    }
    case "smartrecruiters": {
      title = str(p.name);
      const sections = obj(obj(p.jobAd).sections);
      for (const k of ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]) {
        parts.push(htmlToText(str(obj(sections[k]).text)));
      }
      break;
    }
    case "unknown":
      return null;
  }
  const body = parts.filter(Boolean).join("\n\n");
  if (!body) return null;
  return `${title}\nCompany: ${company}\n\n${body}`;
}

type Readable = Exclude<AtsKind, "unknown">;
const READABLE = new Set<string>(["greenhouse", "lever", "ashby", "smartrecruiters"]);

/**
 * Which board to read one role's posting from. A role keeps only its board name and link, so
 * the token comes from, in order: the user's watchlist entry for that company, the company
 * directory, or the role's own link when it is a board URL. Roles pushed from elsewhere are
 * read when their link is a board URL. Null when nothing names a readable board.
 */
export function boardFor(
  job: { source: string; company: string; url: string | null; externalId: string | null },
  watchlist: { company: string; ats: string; token: string | null }[],
  directory: { name: string; ats: string; token: string | null }[],
): { ats: Readable; token: string; externalId: string } | null {
  const fromLink = job.url ? detectAts(job.url) : null;
  const linkAts = fromLink && fromLink.ats !== "unknown" ? fromLink : null;
  const idFromLink = job.url ? (job.url.split("?")[0].split("/").filter(Boolean).pop() ?? null) : null;

  if (READABLE.has(job.source)) {
    const ats = job.source as Readable;
    const externalId = job.externalId ?? idFromLink;
    if (!externalId) return null;
    const watched = watchlist.find((w) => w.ats === ats && w.token && norm(w.company) === norm(job.company));
    if (watched?.token) return { ats, token: watched.token, externalId };
    const listed = directory.find((c) => c.ats === ats && c.token && norm(c.name) === norm(job.company));
    if (listed?.token) return { ats, token: listed.token, externalId };
    if (linkAts?.ats === ats && linkAts.token) return { ats, token: linkAts.token, externalId };
    return null;
  }
  if (linkAts?.token && idFromLink && idFromLink !== linkAts.token) return { ats: linkAts.ats as Readable, token: linkAts.token, externalId: idFromLink };
  return null;
}
