/**
 * Weekly goals for the Home dashboard (.env.example: HOME_GOAL_*). Each is optional: unset
 * means no target is shown for it, never a made-up default. A value present but not a whole
 * number of at least 1 is an error.
 */
const KEYS = { apply: "HOME_GOAL_APPLY", reachOut: "HOME_GOAL_REACH_OUT", practise: "HOME_GOAL_PRACTISE" } as const;

export function homeGoalsFromEnv(env: Record<string, string | undefined>): { apply?: number; reachOut?: number; practise?: number } {
  const out: { apply?: number; reachOut?: number; practise?: number } = {};
  for (const [key, name] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    const raw = env[name];
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number >= 1, got "${raw}"`);
    out[key] = n;
  }
  return out;
}
