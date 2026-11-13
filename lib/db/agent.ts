import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { DbClient } from "../repos/db";
import { bearerToken, hashToken } from "../agent/token";
import { resolveApiToken } from "../repos/api-tokens";
import { asDbClient } from "./supabase";

export interface AgentWorkspace {
  db: DbClient;
  userId: string;
}

export type AgentAuth =
  | { ok: true; workspace: AgentWorkspace }
  | { ok: false; reason: "unconfigured" | "unauthorized" };

/**
 * Resolve an agent request (the MCP endpoint) to a workspace from its bearer token.
 *
 * An agent has no browser session, so this path cannot lean on RLS the way getWorkspace
 * does: it uses the SECRET key, which bypasses RLS. Tenant isolation here is therefore
 * the userId this function returns - resolved from the token hash and from nothing the
 * caller sends - together with the repos, every one of which filters on user_id. Keep
 * both true: nothing reachable from an MCP tool may query without a userId.
 */
export async function getAgentWorkspace(
  authorization: string | null,
  nowIso: string,
  env: Record<string, string | undefined> = process.env,
): Promise<AgentAuth> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return { ok: false, reason: "unconfigured" };

  const token = bearerToken(authorization);
  if (!token) return { ok: false, reason: "unauthorized" };

  const db = asDbClient(createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }));
  const userId = await resolveApiToken(db, hashToken(token), nowIso);
  return userId ? { ok: true, workspace: { db, userId } } : { ok: false, reason: "unauthorized" };
}
