import { norm, type Contact, type Interaction, type Project, type Warmth } from "./types";

/** Contacts whose follow-up is due on or before `today`. */
export function followupsDue(contacts: Contact[], today: string): Contact[] {
  return contacts.filter((c) => c.nextFollowup !== null && c.nextFollowup <= today);
}

const CADENCE_DAYS: Record<Warmth, number> = { hot: 3, warm: 7, cold: 14 };

/** Suggested next follow-up date from the last interaction date and warmth. */
export function nextFollowupDate(lastDate: string, warmth: Warmth): string {
  const d = new Date(Date.parse(lastDate) + CADENCE_DAYS[warmth] * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Everything a message draft needs, assembled WITHOUT an LLM (token rule #3):
 * the LLM later receives this compact context, never the raw history.
 */
export interface MessageContext {
  contact: Contact;
  relevantProjects: Project[];
  lastInteraction: Interaction | null;
  firstTouch: boolean;
  sharedGround: string[];
  oneAskRule: string;
}

export function buildMessageContext(contact: Contact, projects: Project[]): MessageContext {
  const interests = contact.interests.map(norm);
  const relevantProjects = projects.filter((p) => {
    const skills = p.skills.map(norm);
    return interests.some((i) => skills.includes(i) || norm(p.name).includes(i));
  });

  const lastInteraction = contact.interactions[0] ?? null;
  const sharedGround: string[] = [];
  if (contact.network) {
    sharedGround.push(contact.network.name);
    if (contact.network.class) sharedGround.push(`${contact.network.name} ${contact.network.class}`);
    if (contact.network.campus) sharedGround.push(`${contact.network.campus} campus`);
  }
  if (contact.location) sharedGround.push(contact.location);

  return {
    contact,
    relevantProjects,
    lastInteraction,
    firstTouch: lastInteraction === null,
    sharedGround,
    oneAskRule: "Exactly one small, clear ask per message; reference the last exchange if one exists.",
  };
}
