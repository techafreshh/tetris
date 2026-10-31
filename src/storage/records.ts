// Persistent records: high score, total lines, best PPS.
// Dependency-free storage helpers — they take plain snapshots and never
// import game, DOM helpers, or render logic, so they stay unit-testable.

/** Storage key for the all-time high score (plain integer string). */
export const HIGH_SCORE_KEY: string = "tetris-high-score";

/** Storage key for lifetime lines cleared (plain integer string). */
export const TOTAL_LINES_KEY: string = "tetris-total-lines";

/** Storage key for the best pieces-per-second rate (plain float string). */
export const BEST_PPS_KEY: string = "tetris-best-pps";

/** Persisted bests snapshot. */
export interface Records {
  /** All-time high score. */
  readonly highScore: number;
  /** Lifetime lines cleared across recorded runs. */
  readonly totalLines: number;
  /** Best pieces-per-second rate across recorded runs. */
  readonly bestPps: number;
}

/** Per-run stats consumed by recordRun. */
export interface RunStats {
  /** Final run score. */
  readonly score: number;
  /** Final run lines cleared. */
  readonly lines: number;
  /** Run pieces-per-second rate. */
  readonly pps: number;
}

/** Outcome of recording one run. */
export interface RecordResult {
  /** Updated persisted bests. */
  readonly records: Records;
  /** True when the run beat the stored high score. */
  readonly isNewBest: boolean;
}

/** In-memory mirror used when localStorage is absent or throws. */
let memory: Record<string, string> = {};

/**
 * Clear the in-memory fallback mirror (tests only).
 */
export function resetMemoryRecords(): void {
  memory = {};
}

/**
 * Normalize a stored integer: floor, non-finite or negative becomes 0.
 * @param value Raw input value.
 * @returns Non-negative integer.
 */
function normalizeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floored: number = Math.floor(value);
  return floored < 0 ? 0 : floored;
}

/**
 * Normalize a stored rate: non-finite or negative becomes 0.
 * @param value Raw input value.
 * @returns Non-negative finite rate.
 */
function normalizeRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value < 0 ? 0 : value;
}

/**
 * Parse a stored integer string; corrupt input coerces to 0.
 * @param raw Raw stored string or null.
 * @returns Non-negative integer.
 */
function parseStoredInt(raw: string | null): number {
  if (raw === null || raw === undefined) {
    return 0;
  }
  const parsed: number = Number(raw);
  return normalizeInt(parsed);
}

/**
 * Parse a stored rate string; corrupt input coerces to 0.
 * @param raw Raw stored string or null.
 * @returns Non-negative finite rate.
 */
function parseStoredRate(raw: string | null): number {
  if (raw === null || raw === undefined) {
    return 0;
  }
  const parsed: number = Number(raw);
  return normalizeRate(parsed);
}

/**
 * Read one key: try localStorage, fall back to the memory mirror on any
 * throw or when window/localStorage is absent. Never throws.
 * @param key Storage key.
 * @returns Stored string, or null when absent.
 */
function safeGet(key: string): string | null {
  try {
    if (typeof window !== "undefined") {
      const store: unknown = (window as unknown as { localStorage?: unknown })
        .localStorage;
      if (
        store !== null &&
        store !== undefined &&
        typeof (store as { getItem?: unknown }).getItem === "function"
      ) {
        const value: unknown = (store as { getItem: (k: string) => unknown }).getItem(key);
        if (typeof value === "string") {
          memory[key] = value;
          return value;
        }
        if (value === null || value === undefined) {
          if (key in memory) {
            return memory[key];
          }
          return null;
        }
        const text: string = String(value);
        memory[key] = text;
        return text;
      }
    }
  } catch {
    // Fall through to the memory mirror below.
  }
  if (key in memory) {
    return memory[key];
  }
  return null;
}

/**
 * Write one key: update the memory mirror, then try localStorage.
 * Each key is guarded independently; never throws.
 * @param key Storage key.
 * @param value String value to persist.
 */
function safeSet(key: string, value: string): void {
  memory[key] = value;
  try {
    if (typeof window !== "undefined") {
      const store: unknown = (window as unknown as { localStorage?: unknown })
        .localStorage;
      if (
        store !== null &&
        store !== undefined &&
        typeof (store as { setItem?: unknown }).setItem === "function"
      ) {
        (store as { setItem: (k: string, v: string) => void }).setItem(key, value);
      }
    }
  } catch {
    // Private-browsing throwers fall back to memory silently.
  }
}

/**
 * Load persisted bests; corrupt or missing values coerce to 0. Never throws.
 * @returns Current persisted bests.
 */
export function loadRecords(): Records {
  try {
    const highScore: number = parseStoredInt(safeGet(HIGH_SCORE_KEY));
    const totalLines: number = parseStoredInt(safeGet(TOTAL_LINES_KEY));
    const bestPps: number = parseStoredRate(safeGet(BEST_PPS_KEY));
    return { highScore, totalLines, bestPps };
  } catch {
    return { highScore: 0, totalLines: 0, bestPps: 0 };
  }
}

/**
 * Record one finished run: max high score, accumulate lines, max PPS.
 * Every key write is guarded independently; never throws.
 * @param run Per-run stats.
 * @returns Updated bests plus whether the run set a new best.
 */
export function recordRun(run: RunStats): RecordResult {
  try {
    const stored: Records = loadRecords();
    const score: number = normalizeInt(run.score);
    const lines: number = normalizeInt(run.lines);
    const pps: number = normalizeRate(run.pps);
    const isNewBest: boolean = score > stored.highScore && score > 0;
    const highScore: number =
      score > stored.highScore ? score : stored.highScore;
    const totalLines: number = stored.totalLines + lines;
    const bestPps: number = pps > stored.bestPps ? pps : stored.bestPps;
    safeSet(HIGH_SCORE_KEY, String(highScore));
    safeSet(TOTAL_LINES_KEY, String(totalLines));
    safeSet(BEST_PPS_KEY, String(bestPps));
    return { records: { highScore, totalLines, bestPps }, isNewBest };
  } catch {
    const fallback: Records = {
      highScore: normalizeInt(run.score),
      totalLines: normalizeInt(run.lines),
      bestPps: normalizeRate(run.pps),
    };
    return {
      records: fallback,
      isNewBest: fallback.highScore > 0,
    };
  }
}
