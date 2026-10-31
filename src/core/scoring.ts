// Pure score evaluation: line clears, T-spins, back-to-back, combo, drops.
// Pure data module — no DOM, no imports, no timing APIs.
import {
  BACK_TO_BACK_MULTIPLIER,
  COMBO_POINTS_PER_STEP as COMBO_BONUS,
  HARD_DROP_POINTS_PER_CELL,
  LINE_CLEAR_SCORES,
  SOFT_DROP_POINTS_PER_CELL,
} from "./constants";

/** T-spin base scores indexed by lines cleared (0-3), multiplied by level later. */
export const T_SPIN_BASE_SCORES: readonly number[] = [400, 800, 1200, 1600];

/** Options for a single line-clear scoring event. */
export interface ScoreLineClearOptions {
  /** True when the previous clear was difficult (back-to-back chain continues). */
  readonly backToBack?: boolean;
  /** Consecutive-clear count where 0 is the first clear (no bonus). */
  readonly combo?: number;
  /** True when the clear was a T-spin. */
  readonly tSpin?: boolean;
}

/** Normalize a 1-based level: floor, non-finite or < 1 becomes 1. */
function normalizeLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }
  const floored: number = Math.floor(level);
  return floored < 1 ? 1 : floored;
}

/** Normalize lines cleared: floor and clamp into 0-4. */
function normalizeLines(lines: number): number {
  if (!Number.isFinite(lines)) {
    return 0;
  }
  const floored: number = Math.floor(lines);
  if (floored < 0) {
    return 0;
  }
  if (floored > 4) {
    return 4;
  }
  return floored;
}

/** Normalize a non-negative counter (combo, drop cells): floor, min 0. */
function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floored: number = Math.floor(value);
  return floored < 0 ? 0 : floored;
}

/**
 * Return true for difficult clears that sustain back-to-back:
 * a Tetris (4 lines) or any T-spin.
 */
export function isDifficultClear(lines: number, tSpin: boolean): boolean {
  const normalized: number = normalizeLines(lines);
  return normalized === 4 || tSpin === true;
}

/**
 * Score one line-clear event: base x level, optional back-to-back x1.5
 * on difficult clears (floored), plus combo x COMBO_BONUS x level.
 */
export function scoreLineClear(
  lines: number,
  level: number,
  opts: ScoreLineClearOptions = {},
): number {
  const tSpin: boolean = opts.tSpin ?? false;
  let cleared: number = normalizeLines(lines);
  if (tSpin && cleared > 3) {
    cleared = 3;
  }
  const figuredLevel: number = normalizeLevel(level);
  const combo: number = normalizeCount(opts.combo ?? 0);
  const backToBack: boolean = opts.backToBack ?? false;
  const base: number = tSpin
    ? T_SPIN_BASE_SCORES[cleared]
    : LINE_CLEAR_SCORES[cleared];
  let score: number = base * figuredLevel;
  if (backToBack && base > 0 && isDifficultClear(cleared, tSpin)) {
    score = Math.floor(score * BACK_TO_BACK_MULTIPLIER);
  }
  score += combo * COMBO_BONUS * figuredLevel;
  return score;
}

/** Score a soft drop: +1 point per cell travelled. */
export function softDropScore(cells: number): number {
  return normalizeCount(cells) * SOFT_DROP_POINTS_PER_CELL;
}

/** Score a hard drop: +2 points per cell travelled. */
export function hardDropScore(cells: number): number {
  return normalizeCount(cells) * HARD_DROP_POINTS_PER_CELL;
}
