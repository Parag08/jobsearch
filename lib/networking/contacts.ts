import { nextFollowupDate } from "../outreach";
import { norm, WarmthSchema, type Contact, type Interaction, type Warmth } from "../types";
import type { NewContact } from "../repos/contacts";

/**
 * The Network tab's rules (ROADMAP N1). Contacts are typed or pasted, never fetched: a LinkedIn
 * link is stored as a link only (decided 2026-11-10), and the name is read from its slug.
 * Pure: the repo and the page do the I/O.
 */

/** A LinkedIn profile link in any form people paste it, as one canonical URL. */
export function parseLinkedInProfile(input: string): { url: string; slug: string } | null {
  const s = input.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/in\/([^/]+)\/?$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  return { url: `https://www.linkedin.com/in/${slug}`, slug };
}

/** "priya-raman-1a2b3c" -> "Priya Raman": words without digits, capitalised. */
export function nameFromLinkedInSlug(slug: string): string | null {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    /* keep the raw slug */
  }
  const words = decoded
    .split("-")
    .filter((w) => w && !/\d/.test(w))
    .map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1));
  return words.length ? words.join(" ") : null;
}

export interface ContactForm {
  name: string;
  linkedin: string;
  company: string;
  role: string;
  warmth: string;
  /** How you know them: a school, a former employer, a meetup. Kept as the contact's network. */
  how: string;
}

const blank = (s: string) => s.trim() || null;

export function contactFromForm(f: ContactForm): { contact: NewContact } | { error: string } {
  const typed = f.name.trim();
  const pastedInName = parseLinkedInProfile(typed);
  const link = f.linkedin.trim() ? parseLinkedInProfile(f.linkedin) : pastedInName;
  if (f.linkedin.trim() && !link) return { error: "That doesn't look like a LinkedIn profile link (linkedin.com/in/…)." };
  const name = (pastedInName ? null : typed) || (link ? nameFromLinkedInSlug(link.slug) : null);
  if (!name) return { error: "Give a name or paste a LinkedIn profile link." };
  const warmth = WarmthSchema.safeParse(f.warmth);
  const how = blank(f.how);
  return {
    contact: {
      name,
      linkedinUrl: link?.url ?? null,
      company: blank(f.company),
      role: blank(f.role),
      location: null,
      warmth: warmth.success ? warmth.data : "cold",
      status: "not-contacted",
      network: how ? { name: how, class: null, campus: null } : null,
      interests: [],
      nextFollowup: null,
    },
  };
}

/**
 * What logging a conversation changes on the contact. The next follow-up comes from the
 * warmth cadence (lib/outreach.ts) unless the user chose a date (`null` clears it). A meeting
 * (coffee, call) means you have met; a first message means you are waiting for a reply.
 * An older conversation logged late never moves a follow-up set by a newer one.
 */
export function afterInteraction(
  contact: Contact,
  i: Interaction,
  chosenFollowup?: string | null,
): { status: Contact["status"]; nextFollowup: string | null } {
  const latest = contact.interactions[0]?.date;
  if (latest && i.date < latest && chosenFollowup === undefined) {
    return { status: contact.status, nextFollowup: contact.nextFollowup };
  }
  const met = i.channel === "coffee" || i.channel === "call";
  const status: Contact["status"] = met
    ? "met"
    : contact.status === "not-contacted" || contact.status === "dormant"
      ? "awaiting-reply"
      : contact.status;
  const nextFollowup = chosenFollowup !== undefined ? chosenFollowup : nextFollowupDate(i.date, contact.warmth as Warmth);
  return { status, nextFollowup };
}

/** Due (oldest first), upcoming (soonest first), then everyone else by name. */
export function networkSections(contacts: Contact[], today: string): { due: Contact[]; upcoming: Contact[]; rest: Contact[] } {
  const byDate = (a: Contact, b: Contact) => (a.nextFollowup ?? "").localeCompare(b.nextFollowup ?? "") || a.name.localeCompare(b.name);
  return {
    due: contacts.filter((c) => c.nextFollowup !== null && c.nextFollowup <= today).sort(byDate),
    upcoming: contacts.filter((c) => c.nextFollowup !== null && c.nextFollowup > today).sort(byDate),
    rest: contacts.filter((c) => c.nextFollowup === null).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

export function followupLabel(date: string, today: string): string {
  const d = dayDiff(today, date);
  if (d === 0) return "Follow up today";
  if (d === 1) return "Follow up tomorrow";
  if (d > 1) return `Follow up in ${d} days`;
  return `${-d} ${d === -1 ? "day" : "days"} overdue`;
}

/** People per company (keyed by norm), for the Watchlist's company rows. */
export function countByCompany(contacts: Contact[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of contacts) {
    if (!c.company) continue;
    const k = norm(c.company);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
