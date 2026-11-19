/**
 * Stag Hunt: how many players must hunt stag for stag to pay (game_config.stag_threshold),
 * or null for everyone (the classic rule; also when the setting is blank or 0).
 * Mirrors stagThreshold() in the backend's StagHuntEngine.
 */
export function stagThreshold(config?: Record<string, any> | null): number | null {
  const raw = config?.stag_threshold;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}
