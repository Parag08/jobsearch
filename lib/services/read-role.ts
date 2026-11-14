import type { LlmProvider } from "../adapters/llm";
import { findOrCreateNode, mergeJdExtract } from "../sector-graph";
import type { Application, JdExtract, SectorNode } from "../types";
import type { DbClient } from "../repos/db";
import { getApplication, getJdRaw, listApplications, updateApplication } from "../repos/applications";
import { getSectorByPath, saveSector } from "../repos/sectors";
import { getProfile } from "../repos/profiles";
import { jdSignals } from "../editorial/score";

/**
 * Reading a role: the one place a posting's text becomes structure (token rule #1).
 * A pasted JD (processJd) and a role an agent pushes over MCP (agent-sync) both come
 * through here, so every role - applied to or not - carries the same skills, role family
 * and scoring signals, and the role insights can count them.
 */
export interface ReadRoleDeps {
  db: DbClient;
  llm: LlmProvider;
}

/** One small-tier call for the extract; code reads the tag demand; the sector graph learns from it. */
export async function extractRole(
  { db, llm }: ReadRoleDeps,
  userId: string,
  jdRaw: string,
): Promise<{ jd: JdExtract; sector: SectorNode }> {
  const [extracted, profile] = await Promise.all([llm.extractJd(jdRaw), getProfile(db, userId)]);
  // Code, not the model, reads the JD's tag demand through the user's own taxonomy.
  const jd = { ...extracted, signals: jdSignals(jdRaw, profile?.taxonomy ?? { tags: {} }) };

  const node = (await getSectorByPath(db, userId, jd.sectorPath)) ?? findOrCreateNode([], jd.sectorPath);
  mergeJdExtract(node, jd);
  const sector = await saveSector(db, userId, node);
  return { jd, sector };
}

/**
 * Read the stored posting of an application that has none read yet. The company and role
 * stay as the record has them (an agent's or the user's wording wins over the model's).
 * Null when there is nothing to read: no such application, or no posting text.
 */
export async function readRole(deps: ReadRoleDeps, userId: string, applicationId: string): Promise<Application | null> {
  const { db } = deps;
  const [app, jdRaw] = await Promise.all([getApplication(db, userId, applicationId), getJdRaw(db, userId, applicationId)]);
  if (!app || !jdRaw?.trim()) return null;
  const { jd, sector } = await extractRole(deps, userId, jdRaw);
  return updateApplication(db, userId, { ...app, jdExtract: jd, sectorId: app.sectorId ?? sector.id });
}

export interface ReadUnreadResult {
  read: number;
  failed: number;
  /** Roles with posting text still unread after this batch. */
  remaining: number;
}

/** Roles saved before reading existed (or whose read failed): read up to `limit` of them. */
export async function readUnreadRoles(deps: ReadRoleDeps, userId: string, limit: number): Promise<ReadUnreadResult> {
  const unread = await unreadRoleIds(deps.db, userId);
  let read = 0;
  let failed = 0;
  for (const id of unread.slice(0, limit)) {
    try {
      if (await readRole(deps, userId, id)) read++;
    } catch {
      failed++;
    }
  }
  return { read, failed, remaining: unread.length - read };
}

/** Applications with posting text and no extract. */
export async function unreadRoleIds(db: DbClient, userId: string): Promise<string[]> {
  const apps = (await listApplications(db, userId)).filter((a) => !a.jdExtract);
  const texts = await Promise.all(apps.map((a) => getJdRaw(db, userId, a.id)));
  return apps.filter((_, i) => texts[i]?.trim()).map((a) => a.id);
}
