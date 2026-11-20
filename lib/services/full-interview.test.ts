import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { upsertApplication } from "./agent-sync";
import { saveRoleInterview } from "./role-interview";
import { RoleInterviewInputSchema } from "../interview/role-questions";
import { fullInterviewsFor, fullPlanFor, generalInterviewCard } from "./full-interview";
import { createFullSession } from "../repos/full-sessions";
import { startFull } from "../interview/full-session";

const NOW = "2026-11-20T09:00:00.000Z";
const settings = { maxTopics: 6, topicFollowUps: 2, totalFollowUps: 6 };

async function setup() {
  const db = new FakeDb();
  const cog = await upsertApplication({ db }, "u1", { externalRef: "cog", company: "Cognition", role: "Deployed Engineer" }, "2026-11-18");
  const other = await upsertApplication({ db }, "u1", { externalRef: "acme", company: "Acme", role: "PM" }, "2026-11-18");
  await saveRoleInterview(
    { db },
    "u1",
    RoleInterviewInputSchema.parse({
      externalRef: "cog",
      round: "Technical interview",
      interviewer: "a Deployed Engineer at Cognition",
      questions: [
        { externalRef: "c:bg", competency: "Motivation", text: "Walk me through your background.", lookFor: "an arc" },
        { externalRef: "c:q", competency: "Motivation", text: "What questions do you have for me?", lookFor: "good ones" },
        { externalRef: "c:deep", competency: "Technical depth", text: "Walk me through something you built.", lookFor: "depth" },
      ],
    }),
    NOW,
  );
  return { db, cogId: cog.record.id, otherId: other.record.id };
}

describe("fullPlanFor", () => {
  it("uses the pushed round when there is one, close last", async () => {
    const { db, cogId } = await setup();
    const plan = await fullPlanFor(db, "u1", cogId, settings);
    expect(plan?.source).toBe("role");
    expect(plan?.interviewer).toBe("a Deployed Engineer at Cognition");
    expect(plan?.topics.map((t) => t.kind)).toEqual(["opener", "topic", "close"]);
  });

  it("builds from the job when no round was pushed", async () => {
    const { db, otherId } = await setup();
    const plan = await fullPlanFor(db, "u1", otherId, settings);
    expect(plan?.source).toBe("job");
    expect(plan?.topics[0].id).toMatch(/^company:acme:/);
  });

  it("is null for another user's or an unknown application", async () => {
    const { db, cogId } = await setup();
    expect(await fullPlanFor(db, "u2", cogId, settings)).toBeNull();
    expect(await fullPlanFor(db, "u1", "nope", settings)).toBeNull();
  });
});

describe("fullInterviewsFor", () => {
  it("one card per live application, with the round and the latest session", async () => {
    const { db, cogId } = await setup();
    const plan = (await fullPlanFor(db, "u1", cogId, settings))!;
    const s = await createFullSession(db, "u1", startFull(plan, settings, "neutral", NOW));
    const cards = await fullInterviewsFor(db, "u1", settings);
    const cog = cards.find((c) => c.applicationId === cogId)!;
    expect(cog).toMatchObject({ company: "Cognition", slug: "cognition", source: "role", round: "Technical interview", topics: 3, runningId: s.id, best: null });
    expect(cards.find((c) => c.company === "Acme")?.source).toBe("job");
  });
});

describe("general practice interview", () => {
  it("needs no application: a bank plan, its own card and sessions", async () => {
    const { db } = await setup();
    const plan = (await fullPlanFor(db, "u1", null, settings))!;
    expect(plan.source).toBe("general");
    expect(plan.topics[0].id).toBe("fit-about-yourself");
    const s = await createFullSession(db, "u1", startFull(plan, settings, "neutral", NOW));
    const card = await generalInterviewCard(db, "u1", settings);
    expect(card).toMatchObject({ applicationId: null, slug: "general", runningId: s.id });
    expect((await fullInterviewsFor(db, "u1", settings)).every((c) => c.runningId !== s.id)).toBe(true);
  });
});
