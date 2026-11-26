import { deflateRawSync, inflateRawSync } from "node:zlib";
import { expect, it } from "vitest";
import { signDemoMac } from "../demo/node-mac";
import { DEMO_KITS_COOKIE_LIMIT } from "../demo/visitors";
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

it("ignores signed journals beyond the cookie and decompression limits", async () => {
  const date = new Date().toISOString().slice(0, 10);
  const visitor = "00000000-0000-4000-8000-000000000001";
  const secret = "test-only-demo-journal-secret";
  const writer = freshVisitorDb(date);
  const reader = freshVisitorDb(date);
  const role = writer.rows("sourced_jobs").find((row) => row.external_id === "demo-1")!;
  const originalDecision = role.sourcing_decision;
  expect(originalDecision).not.toBe("picked");
  await setSourcingDecision(writer, DEMO_USER_ID, role.id, "picked");
  const valid = writeDemoKits(writer, visitor, secret);
  const compressed = Buffer.from(valid.split(".")[0], "base64url");

  const sign = (contents: Buffer) => {
    const payload = contents.toString("base64url");
    return payload + "." + signDemoMac(secret, "kits", visitor + "." + payload);
  };
  const wireOversize = sign(Buffer.concat([compressed, Buffer.alloc(DEMO_KITS_COOKIE_LIMIT)]));
  const expandedOversize = sign(deflateRawSync(inflateRawSync(compressed).toString("utf8") + " ".repeat(16_384)));
  expect(wireOversize.length).toBeGreaterThan(DEMO_KITS_COOKIE_LIMIT);
  expect(expandedOversize.length).toBeLessThan(DEMO_KITS_COOKIE_LIMIT);

  const decision = () => reader.rows("sourced_jobs").find((row) => row.external_id === "demo-1")?.sourcing_decision;
  restoreDemoKits(reader, wireOversize, visitor, secret);
  expect(decision()).toBe(originalDecision);
  restoreDemoKits(reader, expandedOversize, visitor, secret);
  expect(decision()).toBe(originalDecision);
  restoreDemoKits(reader, valid, visitor, secret);
  expect(decision()).toBe("picked");
});
