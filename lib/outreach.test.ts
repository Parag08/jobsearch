import { describe, it, expect } from "vitest";
import { followupsDue, nextFollowupDate, buildMessageContext } from "./outreach";
import type { Contact, Project } from "./types";

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    name: "Priya Nair",
    network: { name: "INSEAD", class: "MBA 22J", campus: "Singapore" },
    company: "Grab",
    role: "Senior PM",
    location: "Singapore",
    warmth: "warm",
    status: "in-conversation",
    interests: ["marketplace pricing"],
    interactions: [{ date: "2026-08-10", channel: "linkedin", summary: "Offered intro to her director." }],
    nextFollowup: "2026-08-20",
    ...over,
  };
}

describe("followupsDue", () => {
  it("returns contacts whose nextFollowup is today or earlier", () => {
    const due = contact({ id: "due", nextFollowup: "2026-08-29" });
    const later = contact({ id: "later", nextFollowup: "2026-09-05" });
    const none = contact({ id: "none", nextFollowup: null });
    expect(followupsDue([due, later, none], "2026-08-29").map((c) => c.id)).toEqual(["due"]);
  });
});

describe("nextFollowupDate", () => {
  it("suggests 7 days for warm, 14 for cold", () => {
    expect(nextFollowupDate("2026-08-01", "warm")).toBe("2026-08-08");
    expect(nextFollowupDate("2026-08-01", "cold")).toBe("2026-08-15");
  });
  it("suggests 3 days for hot", () => {
    expect(nextFollowupDate("2026-08-01", "hot")).toBe("2026-08-04");
  });
});

describe("buildMessageContext", () => {
  const projects: Project[] = [
    {
      id: "p1",
      name: "Marketplace pricing revamp",
      org: "Acme",
      dates: null,
      role: null,
      narrative: "",
      outcomes: ["GMV +12%"],
      skills: ["marketplace pricing", "experimentation"],
      sectorTags: [],
      bullets: [],
    },
    {
      id: "p2",
      name: "Warehouse ops",
      org: "Acme",
      dates: null,
      role: null,
      narrative: "",
      outcomes: [],
      skills: ["operations"],
      sectorTags: [],
      bullets: [],
    },
  ];

  it("selects projects overlapping the contact's interests", () => {
    const ctx = buildMessageContext(contact(), projects);
    expect(ctx.relevantProjects.map((p) => p.id)).toEqual(["p1"]);
  });

  it("carries the latest interaction so the draft can reference it (never repeat an ask)", () => {
    const ctx = buildMessageContext(contact(), projects);
    expect(ctx.lastInteraction?.summary).toContain("intro");
  });

  it("flags a first-touch when there is no interaction history", () => {
    const ctx = buildMessageContext(contact({ interactions: [] }), projects);
    expect(ctx.lastInteraction).toBeNull();
    expect(ctx.firstTouch).toBe(true);
  });

  it("names shared ground from the network affiliation", () => {
    const ctx = buildMessageContext(contact(), projects);
    expect(ctx.sharedGround).toContain("INSEAD");
  });
});
