import type { LlmProvider } from "../adapters/llm";
import { findOrCreateNode, mergeJdExtract } from "../sector-graph";
import type { Application, SectorNode } from "../types";
import type { DbClient } from "../repos/db";
import { insertApplication } from "../repos/applications";
import { getSectorByPath, saveSector } from "../repos/sectors";
import { getProfile } from "../repos/profiles";
import { jdSignals } from "../editorial/score";

export interface ProcessJdDeps {
  db: DbClient;
  llm: LlmProvider;
}

export interface ProcessJdResult {
  application: Application;
  sector: SectorNode;
}

/**
 * JD intake (behind POST /api/jd): parse the raw JD ONCE into a JdExtract,
 * merge it into the user's sector graph, and open a 'saved' application.
 * The raw text goes to the DB as an audit copy and never re-enters a prompt.
 */
export async function processJd(
  { db, llm }: ProcessJdDeps,
  userId: string,
  jdRaw: string,
  now: string,
): Promise<ProcessJdResult> {
  const [extracted, profile] = await Promise.all([llm.extractJd(jdRaw), getProfile(db, userId)]);
  // Code, not the model, reads the JD's tag demand through the user's own taxonomy.
  const jd = { ...extracted, signals: jdSignals(jdRaw, profile?.taxonomy ?? { tags: {} }) };

  const node = (await getSectorByPath(db, userId, jd.sectorPath)) ?? findOrCreateNode([], jd.sectorPath);
  mergeJdExtract(node, jd);
  const sector = await saveSector(db, userId, node);

  const application = await insertApplication(
    db,
    userId,
    {
      company: jd.company,
      role: jd.role,
      sectorId: sector.id,
      stage: "saved",
      closedReason: null,
      jdExtract: jd,
      cvVersionId: null,
      referralContactId: null,
      nextAction: null,
      savedAt: now.slice(0, 10),
      appliedAt: null,
      updatedAt: now,
    },
    jdRaw,
  );

  return { application, sector };
}
