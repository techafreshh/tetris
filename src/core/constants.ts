// Core tuning tables: board geometry, input timing, colors, gravity, scoring.
// Pure data module — no DOM, no imports, no timing APIs.

/** Visible playfield width in cells. */
export const COLS = 10;
/** Visible playfield height in cells. */
export const ROWS = 20;
/** Hidden spawn buffer rows above the visible playfield. */
export const HIDDEN_ROWS = 2;

/** Delayed Auto Shift: initial held-key delay in milliseconds. */
export const DAS_MS = 167;
/** Auto Repeat Rate: held-key repeat interval in milliseconds. */
export const ARR_MS = 33;
/** Lock delay before a grounded piece locks in milliseconds. */
export const LOCK_DELAY_MS = 500;
/** Soft drop falls this many times faster than gravity. */
export const SOFT_DROP_MULTIPLIER = 20;

/** Guideline tetromino colors keyed by piece letter. */
export const PIECE_COLORS = {
  I: "#00F0F0",
  O: "#F0F000",
  T: "#A000F0",
  S: "#00F000",
  Z: "#F00000",
  J: "#0000F0",
  L: "#F0A000",
} as const;

/**
 * Gravity curve: integer frames per row at 60 fps, index level - 1.
 * Strictly decreasing so higher levels fall faster.
 */
export const GRAVITY_FRAMES_PER_CELL: readonly number[] = [
  48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 4, 3, 2, 1,
];

/** Gravity curve derived into milliseconds per row, index level - 1. */
export const GRAVITY_INTERVAL_MS: readonly number[] =
  GRAVITY_FRAMES_PER_CELL.map((frames: number): number => (frames * 1000) / 60);

/** Gravity interval in ms for a 1-based level, clamped into table range. */
export function gravityIntervalMsForLevel(level: number): number {
  const floored: number = Math.floor(level);
  if (floored < 1) {
    return GRAVITY_INTERVAL_MS[0];
  }
  if (floored > GRAVITY_INTERVAL_MS.length) {
    return GRAVITY_INTERVAL_MS[GRAVITY_INTERVAL_MS.length - 1];
  }
  return GRAVITY_INTERVAL_MS[floored - 1];
}

/** Base line-clear scores indexed by lines cleared (0-4), multiplied by level later. */
export const LINE_CLEAR_SCORES: readonly number[] = [0, 100, 300, 500, 800];
/** Lines cleared required per level. */
export const LINES_PER_LEVEL: number = 10;
/** Points per cell travelled by soft drop. */
export const SOFT_DROP_POINTS_PER_CELL: number = 1;
/** Points per cell travelled by hard drop. */
export const HARD_DROP_POINTS_PER_CELL: number = 2;
/** Back-to-back bonus multiplier. */
export const BACK_TO_BACK_MULTIPLIER: number = 1.5;
/** Combo bonus points per combo step (times level). */
export const COMBO_POINTS_PER_STEP: number = 50;
