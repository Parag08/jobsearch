/**
 * How many days of activity the pipeline board shows by default (PIPELINE_RECENT_DAYS,
 * see .env.example). Unset = undefined and the board shows every application rather than
 * guessing a window. A value present but unusable is an error.
 */
export function pipelineRecentDaysFromEnv(env: Record<string, string | undefined>): number | undefined {
  const raw = env.PIPELINE_RECENT_DAYS;
  if (!raw) return undefined;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`PIPELINE_RECENT_DAYS must be a whole number >= 1, got "${raw}"`);
  }
  return days;
}

/**
 * How many cards a board column shows before the rest fold under "show more"
 * (PIPELINE_COLUMN_MAX). Unset = undefined and a column shows every card.
 */
export function pipelineColumnMaxFromEnv(env: Record<string, string | undefined>): number | undefined {
  const raw = env.PIPELINE_COLUMN_MAX;
  if (!raw) return undefined;
  const max = Number(raw);
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`PIPELINE_COLUMN_MAX must be a whole number >= 1, got "${raw}"`);
  }
  return max;
}
