import { z } from "zod";
import type { Application } from "../types";
import type { Question, QuestionGroup } from "./questions";

/**
 * Company-specific interview questions, built from the companies you are applying to.
 *
 * The behavioural bank is generic - a good story is a good story at any firm. What differs
 * per company is "why us?", so those questions come from your pipeline: one set per company
 * with a live application, worded from templates in data/interview/questions.json (rule 4).
 * Ids are stable (`company:<slug>:<template>`), so an answer stays with its company.
 * The context handed to the interviewer is only what the job description said - the model
 * is never told anything about the firm that you did not paste in.
 */

export const COMPANY_GROUP: QuestionGroup = { id: "company", label: "Your companies" };
const PREFIX = "company:";

export const CompanyTemplateSchema = z.object({
  id: z.string().min(1),
  competency: z.string().min(1),
  text: z.string().min(1),
  lookFor: z.string().min(1),
  /** List label under the company's name, e.g. "Why this role?". Falls back to text. */
  short: z.string().min(1).optional(),
});
export type CompanyTemplate = z.infer<typeof CompanyTemplateSchema>;

export interface CompanyQuestion extends Question {
  company: string;
  /** Compact label for the list, shown under the company's name. */
  short: string;
  /** Facts from the job description, for the interviewer's prompt. Null if none. */
  context: string | null;
}

export function parseCompanyTemplates(raw: unknown): CompanyTemplate[] {
  const list = z.array(CompanyTemplateSchema).parse(raw);
  const seen = new Set<string>();
  for (const t of list) {
    if (!t.text.includes("{company}")) throw new Error(`company question "${t.id}" must name {company}`);
    if (seen.has(t.id)) throw new Error(`company question: duplicate id "${t.id}"`);
    seen.add(t.id);
  }
  return list;
}

export function companySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isCompanyQuestionId(id: string): boolean {
  return id.startsWith(PREFIX);
}

const MAX_SKILLS = 6;

function contextFor(a: Application): string {
  const parts = [`Role applied for: ${a.role.trim()}.`];
  const jd = a.jdExtract;
  if (jd) {
    if (jd.skills.length) parts.push(`The job asks for: ${jd.skills.slice(0, MAX_SKILLS).join(", ")}.`);
    if (jd.sectorPath.length) parts.push(`Sector: ${jd.sectorPath.join(" > ")}.`);
    if (jd.location) parts.push(`Location: ${jd.location}.`);
  }
  return parts.join(" ");
}

const fill = (s: string, company: string, role: string) => s.replaceAll("{company}", company).replaceAll("{role}", role);

/**
 * One set of questions per company with a live (not closed) application, most recently
 * active company first. Several applications to one company merge; the newest role wins.
 */
export function companyQuestions(apps: Application[], templates: CompanyTemplate[]): CompanyQuestion[] {
  const latest = new Map<string, Application>();
  for (const a of apps) {
    if (a.closedReason !== null || !a.company.trim()) continue;
    const slug = companySlug(a.company);
    const prev = latest.get(slug);
    if (!prev || a.updatedAt > prev.updatedAt) latest.set(slug, a);
  }
  const ordered = [...latest.entries()].sort((x, y) => (x[1].updatedAt < y[1].updatedAt ? 1 : -1));

  const out: CompanyQuestion[] = [];
  for (const [slug, a] of ordered) {
    const company = a.company.trim();
    const role = a.role.trim();
    for (const t of templates) {
      if (t.text.includes("{role}") && !role) continue;
      out.push({
        id: `${PREFIX}${slug}:${t.id}`,
        group: COMPANY_GROUP.id,
        competency: t.competency,
        text: fill(t.text, company, role),
        lookFor: fill(t.lookFor, company, role),
        firms: [],
        company,
        short: fill(t.short ?? t.text, company, role),
        context: role ? contextFor(a) : null,
      });
    }
  }
  return out;
}
