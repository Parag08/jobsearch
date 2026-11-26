import { expect, it } from "vitest";
import { setSourcingDecision } from "../repos/sourcing";
import { prepareSourcingBatch } from "../services/sourcing-kits";
import { DEMO_USER_ID, freshVisitorDb } from "./demo";
import { restoreDemoKits, writeDemoKits } from "./demo-kits";

it("merges a newer journal into a warm demo without removing or replacing local data", async () => {
  const date = new Date().toISOString().slice(0, 10);
  const visitor = "00000000-0000-4000-8000-000000000001";
  const secret = "test-only-demo-journal-secret";
  const warm = freshVisitorDb(date);
  const writer = freshVisitorDb(date);
  const role = warm.rows("sourced_jobs").find((row) => row.external_id === "demo-1")!;
  const otherRole = warm.rows("sourced_jobs").find((row) => row.external_id === "demo-2")!;

  const legacy = warm.rows("applications").find((row) => !row.sourcing_kit)!;
  await warm.from("applications").update({ next_action: "Local follow-up" }).eq("id", legacy.id);
  await setSourcingDecision(writer, DEMO_USER_ID, role.id, "picked");
  const { applicationIds: [remoteId] } = await prepareSourcingBatch(writer, DEMO_USER_ID, date);
  expect(remoteId).toBeDefined();
  const remote = writer.rows("applications").find((row) => row.id === remoteId)!;
  const localId = crypto.randomUUID();
  await warm.from("applications").insert({
    ...remote, id: localId, external_ref: "sourced:" + otherRole.id,
    sourcing_kit: { ...(remote.sourcing_kit as object), jobId: otherRole.id },
  });
  await setSourcingDecision(warm, DEMO_USER_ID, otherRole.id, "picked");

  const first = writeDemoKits(writer, visitor, secret);
  restoreDemoKits(warm, first, visitor, secret);
  expect(warm.rows("applications")).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: localId }),
    expect.objectContaining({ id: remoteId }),
    expect.objectContaining({ id: legacy.id, next_action: "Local follow-up" }),
  ]));
  expect(warm.rows("sourced_jobs").find((row) => row.id === otherRole.id)?.sourcing_decision).toBe("picked");

  await warm.from("applications").update({ status_note: "Local annotation" }).eq("id", remoteId);
  await writer.from("applications").update({ sourcing_revision: 1, next_action: "Remote follow-up" }).eq("id", remoteId);
  const second = writeDemoKits(writer, visitor, secret);
  restoreDemoKits(warm, second, visitor, secret);
  restoreDemoKits(warm, first, visitor, secret);
  expect(warm.rows("applications").find((row) => row.id === remoteId)).toMatchObject({
    sourcing_revision: 1, next_action: "Remote follow-up", status_note: "Local annotation",
  });
});
