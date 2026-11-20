import { describe, it, expect } from "vitest";
import type { Contact } from "../types";
import {
  afterInteraction,
  contactFromForm,
  countByCompany,
  followupLabel,
  nameFromLinkedInSlug,
  networkSections,
  parseLinkedInProfile,
} from "./contacts";

const base: Contact = {
  id: "c1",
  name: "Priya Raman",
  network: null,
  company: "Kestrel AI",
  role: null,
  location: null,
  warmth: "warm",
  status: "not-contacted",
  interests: [],
  interactions: [],
  nextFollowup: null,
};
const c = (over: Partial<Contact>): Contact => ({ ...base, ...over });

describe("parseLinkedInProfile", () => {
  it("normalises a pasted profile link to one canonical URL", () => {
    for (const raw of [
      "https://www.linkedin.com/in/priya-raman-1a2b3c/",
      "linkedin.com/in/priya-raman-1a2b3c?utm_source=share",
      "  https://sg.linkedin.com/in/Priya-Raman-1a2b3c  ",
    ]) {
      expect(parseLinkedInProfile(raw)).toEqual({ url: "https://www.linkedin.com/in/priya-raman-1a2b3c", slug: "priya-raman-1a2b3c" });
    }
  });
  it("is null for anything that is not a profile link", () => {
    expect(parseLinkedInProfile("Priya Raman")).toBeNull();
    expect(parseLinkedInProfile("https://www.linkedin.com/company/kestrel")).toBeNull();
    expect(parseLinkedInProfile("https://evil.example.com/in/priya")).toBeNull();
    expect(parseLinkedInProfile("")).toBeNull();
  });
});

describe("nameFromLinkedInSlug", () => {
  it("reads the name from the slug and drops the id LinkedIn adds", () => {
    expect(nameFromLinkedInSlug("priya-raman-1a2b3c")).toBe("Priya Raman");
    expect(nameFromLinkedInSlug("tan-wei-ming")).toBe("Tan Wei Ming");
    expect(nameFromLinkedInSlug("jos%C3%A9-ortiz-12345678")).toBe("José Ortiz");
  });
  it("is null when nothing name-like is left", () => {
    expect(nameFromLinkedInSlug("12345678")).toBeNull();
  });
});

describe("contactFromForm", () => {
  it("takes a typed name and the optional fields", () => {
    const r = contactFromForm({ name: " Priya Raman ", linkedin: "", company: "Kestrel AI", role: "GPM", warmth: "warm", how: "INSEAD 2024" });
    expect(r).toMatchObject({
      contact: { name: "Priya Raman", company: "Kestrel AI", role: "GPM", warmth: "warm", status: "not-contacted", linkedinUrl: null, network: { name: "INSEAD 2024", class: null, campus: null } },
    });
  });
  it("fills the name from a pasted LinkedIn link, keeping the link only", () => {
    const r = contactFromForm({ name: "", linkedin: "linkedin.com/in/tan-wei-ming-9f8e7d", company: "", role: "", warmth: "", how: "" });
    expect(r).toMatchObject({ contact: { name: "Tan Wei Ming", linkedinUrl: "https://www.linkedin.com/in/tan-wei-ming-9f8e7d", company: null, warmth: "cold", network: null } });
  });
  it("accepts a LinkedIn link pasted into the name box", () => {
    const r = contactFromForm({ name: "https://www.linkedin.com/in/tan-wei-ming", linkedin: "", company: "", role: "", warmth: "", how: "" });
    expect(r).toMatchObject({ contact: { name: "Tan Wei Ming", linkedinUrl: "https://www.linkedin.com/in/tan-wei-ming" } });
  });
  it("refuses a form with no name and no profile link, or a bad link", () => {
    expect(contactFromForm({ name: "", linkedin: "", company: "", role: "", warmth: "", how: "" })).toEqual({ error: "Give a name or paste a LinkedIn profile link." });
    expect(contactFromForm({ name: "Priya", linkedin: "https://example.com/x", company: "", role: "", warmth: "", how: "" })).toEqual({
      error: "That doesn't look like a LinkedIn profile link (linkedin.com/in/…).",
    });
  });
});

describe("afterInteraction", () => {
  it("sets the next follow-up from the warmth and moves a first message to awaiting reply", () => {
    const r = afterInteraction(c({ warmth: "warm" }), { date: "2026-11-20", channel: "linkedin", summary: "Asked for a chat." });
    expect(r).toEqual({ status: "awaiting-reply", nextFollowup: "2026-11-27" });
  });
  it("marks a coffee or a call as met", () => {
    expect(afterInteraction(c({ warmth: "hot", status: "awaiting-reply" }), { date: "2026-11-20", channel: "coffee", summary: "x" })).toEqual({
      status: "met",
      nextFollowup: "2026-11-23",
    });
  });
  it("keeps a conversation that is already going", () => {
    expect(afterInteraction(c({ status: "in-conversation", warmth: "cold" }), { date: "2026-11-20", channel: "email", summary: "x" }).status).toBe("in-conversation");
  });
  it("uses the date the user chose, and none when they clear it", () => {
    expect(afterInteraction(c({}), { date: "2026-11-20", channel: "email", summary: "x" }, "2026-12-01").nextFollowup).toBe("2026-12-01");
    expect(afterInteraction(c({}), { date: "2026-11-20", channel: "email", summary: "x" }, null).nextFollowup).toBeNull();
  });
  it("logging an older conversation does not move a later follow-up", () => {
    const later = c({ status: "met", nextFollowup: "2026-12-05", interactions: [{ date: "2026-11-28", channel: "call", summary: "y" }] });
    expect(afterInteraction(later, { date: "2026-11-01", channel: "email", summary: "x" })).toEqual({ status: "met", nextFollowup: "2026-12-05" });
  });
});

describe("networkSections", () => {
  it("puts follow-ups due first (oldest first), then upcoming, then the rest by name", () => {
    const list = [
      c({ id: "a", name: "Zed", nextFollowup: null }),
      c({ id: "b", name: "Bea", nextFollowup: "2026-11-25" }),
      c({ id: "c", name: "Cal", nextFollowup: "2026-11-18" }),
      c({ id: "d", name: "Dee", nextFollowup: "2026-11-20" }),
      c({ id: "e", name: "Amy", nextFollowup: null }),
    ];
    const s = networkSections(list, "2026-11-20");
    expect(s.due.map((x) => x.id)).toEqual(["c", "d"]);
    expect(s.upcoming.map((x) => x.id)).toEqual(["b"]);
    expect(s.rest.map((x) => x.id)).toEqual(["e", "a"]);
  });
});

describe("followupLabel", () => {
  it("says how far off a follow-up is", () => {
    expect(followupLabel("2026-11-20", "2026-11-20")).toBe("Follow up today");
    expect(followupLabel("2026-11-19", "2026-11-20")).toBe("1 day overdue");
    expect(followupLabel("2026-11-15", "2026-11-20")).toBe("5 days overdue");
    expect(followupLabel("2026-11-21", "2026-11-20")).toBe("Follow up tomorrow");
    expect(followupLabel("2026-11-27", "2026-11-20")).toBe("Follow up in 7 days");
  });
});

describe("countByCompany", () => {
  it("counts people per company, matching names loosely", () => {
    const m = countByCompany([c({ company: "Kestrel AI" }), c({ company: "kestrel ai " }), c({ company: null })]);
    expect(m.get("kestrel ai")).toBe(2);
    expect(m.size).toBe(1);
  });
});
