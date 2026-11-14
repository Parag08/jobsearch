/**
 * Role insights settings from config (.env.example): ROLE_PLAN_MAX_GAPS (how many gaps a
 * plan covers) and ROLE_READ_BATCH (how many unread roles one click reads). No in-code
 * defaults: unset = undefined and the feature that needs it is off. A value present but
 * unusable is an error.
 */
function wholeFromEnv(env: Record<string, string | undefined>, key: string): number | undefined {
  const raw = env[key];
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${key} must be a whole number >= 1, got "${raw}"`);
  return n;
}

export const rolePlanMaxGapsFromEnv = (env: Record<string, string | undefined>) => wholeFromEnv(env, "ROLE_PLAN_MAX_GAPS");
export const roleReadBatchFromEnv = (env: Record<string, string | undefined>) => wholeFromEnv(env, "ROLE_READ_BATCH");
