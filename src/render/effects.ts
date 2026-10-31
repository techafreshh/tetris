// Renderer-only juice: line-clear flash/collapse, lock flash, shake.
// Pure timing module — no DOM, no rAF, no timers, no game-logic imports.
// Every method takes an explicit `nowMs` so tests drive time with literals.
// The game settles instantly; these snapshots only paint fading overlays.

/** White flash duration over cleared rows in milliseconds. */
export const CLEAR_FLASH_MS: number = 100;

/** Total line-clear collapse overlay duration in milliseconds. */
export const CLEAR_COLLAPSE_MS: number = 200;

/** Lock flash duration over stamped cells in milliseconds. */
export const LOCK_FLASH_MS: number = 120;

/** Playfield shake duration in milliseconds. */
export const SHAKE_MS: number = 220;

/** Peak playfield shake amplitude in CSS pixels. */
export const SHAKE_PX: number = 4;

/** Pure-white flash overlay color; alpha ramps down over the duration. */
export const FLASH_COLOR: string = "#FFFFFF";

/** Line-clear overlay: white flash alpha plus shrink progress. */
export interface ClearSnapshot {
  /** Pre-clear full-row indices painted by the overlay. */
  readonly rows: readonly number[];
  /** White flash alpha in 0..1 (1 at lock, 0 after CLEAR_FLASH_MS). */
  readonly flashAlpha: number;
  /** Collapse progress in 0..1 (1 once CLEAR_COLLAPSE_MS elapses). */
  readonly collapse: number;
  /** True while the collapse overlay still has time left. */
  readonly active: boolean;
}

/** Lock overlay: fading white rects over the stamped cells. */
export interface LockSnapshot {
  /** Absolute stamped cells painted by the overlay. */
  readonly cells: readonly (readonly [number, number])[];
  /** White flash alpha in 0..1 (1 at lock, 0 after LOCK_FLASH_MS). */
  readonly flashAlpha: number;
  /** True while the lock flash still has time left. */
  readonly active: boolean;
}

/** Combined per-frame juice for `renderPlayfield`. */
export interface EffectsSnapshot {
  /** Line-clear flash/collapse overlay state. */
  readonly clear: ClearSnapshot;
  /** Lock flash overlay state. */
  readonly lock: LockSnapshot;
  /** Horizontal playfield shake offset in CSS pixels. */
  readonly shakeDx: number;
  /** Vertical playfield shake offset in CSS pixels. */
  readonly shakeDy: number;
  /** True while the shake still has time left. */
  readonly shakeActive: boolean;
  /** True while any overlay or shake is still visible. */
  readonly active: boolean;
}

/** Idle clear snapshot shared by fresh and expired effect state. */
const IDLE_CLEAR: ClearSnapshot = {
  rows: [],
  flashAlpha: 0,
  collapse: 1,
  active: false,
};

/** Idle lock snapshot shared by fresh and expired effect state. */
const IDLE_LOCK: LockSnapshot = {
  cells: [],
  flashAlpha: 0,
  active: false,
};

/** Idle combined snapshot shared by fresh and expired effect state. */
const IDLE_SNAPSHOT: EffectsSnapshot = {
  clear: IDLE_CLEAR,
  lock: IDLE_LOCK,
  shakeDx: 0,
  shakeDy: 0,
  shakeActive: false,
  active: false,
};

/**
 * White flash alpha for elapsed milliseconds within a duration.
 * @param elapsedMs Milliseconds since the effect started (clamped at 0).
 * @param durationMs Flash duration in milliseconds.
 * @returns Alpha in 0..1, fading linearly to 0 at the duration.
 */
export function flashAlphaFor(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs)) {
    return 0;
  }
  if (durationMs <= 0) {
    return 0;
  }
  const elapsed: number = Math.max(0, elapsedMs);
  if (elapsed >= durationMs) {
    return 0;
  }
  return 1 - elapsed / durationMs;
}

/**
 * Line-clear collapse progress for elapsed milliseconds.
 * @param elapsedMs Milliseconds since the clear started (clamped at 0).
 * @returns Progress in 0..1, reaching 1 at CLEAR_COLLAPSE_MS.
 */
export function collapseFor(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) {
    return 1;
  }
  const elapsed: number = Math.max(0, elapsedMs);
  if (elapsed >= CLEAR_COLLAPSE_MS) {
    return 1;
  }
  return elapsed / CLEAR_COLLAPSE_MS;
}

/**
 * Decaying sine shake offset for elapsed milliseconds.
 * @param elapsedMs Milliseconds since the shake started (clamped at 0).
 * @returns Horizontal/vertical CSS-pixel offsets (0,0 once SHAKE_MS elapses).
 */
export function shakeOffsetFor(elapsedMs: number): {
  readonly dx: number;
  readonly dy: number;
} {
  if (!Number.isFinite(elapsedMs)) {
    return { dx: 0, dy: 0 };
  }
  const elapsed: number = Math.max(0, elapsedMs);
  if (elapsed >= SHAKE_MS) {
    return { dx: 0, dy: 0 };
  }
  const progress: number = elapsed / SHAKE_MS;
  const amplitude: number = SHAKE_PX * (1 - progress);
  return {
    dx: amplitude * Math.sin(progress * Math.PI * 4),
    dy: 0,
  };
}

/**
 * Timestamp-driven juice state machine: flash, collapse, and shake.
 * Stores timestamps only; the caller threads rAF `nowMs` through.
 */
export class Effects {
  /** Pre-clear full-row indices of the latest clear. */
  private clearRows: readonly number[] = [];
  /** Timestamp of the latest clear notification. */
  private clearStart: number = Number.NEGATIVE_INFINITY;
  /** True once a clear has been notified. */
  private hasClear: boolean = false;
  /** Stamped cells of the latest lock. */
  private lockCells: readonly (readonly [number, number])[] = [];
  /** Timestamp of the latest lock notification. */
  private lockStart: number = Number.NEGATIVE_INFINITY;
  /** True once a lock has been notified. */
  private hasLock: boolean = false;
  /** Timestamp of the latest shake trigger (Tetris or T-spin). */
  private shakeStart: number = Number.NEGATIVE_INFINITY;
  /** True once a shake has been triggered. */
  private hasShake: boolean = false;

  /**
   * Record a line clear: flash then collapse the rows, shake on Tetris/T-spin.
   * @param lines Cleared row count (gates the shake at 4 plus T-spin).
   * @param rows Pre-clear full-row indices painted by the overlay.
   * @param tSpin True when the clear scored as a T-spin (also shakes).
   * @param nowMs Effect clock timestamp in milliseconds.
   */
  public notifyClear(
    lines: number,
    rows: readonly number[],
    tSpin: boolean,
    nowMs: number,
  ): void {
    const now: number = Number.isFinite(nowMs) ? nowMs : 0;
    this.clearRows = [...rows];
    this.clearStart = now;
    this.hasClear = true;
    if (lines >= 4 || tSpin === true) {
      this.shakeStart = now;
      this.hasShake = true;
    }
  }

  /**
   * Record a lock: flash the stamped cells briefly.
   * @param cells Absolute stamped cells painted by the overlay.
   * @param nowMs Effect clock timestamp in milliseconds.
   */
  public notifyLock(
    cells: readonly (readonly [number, number])[],
    nowMs: number,
  ): void {
    const now: number = Number.isFinite(nowMs) ? nowMs : 0;
    this.lockCells = cells.map(
      (cell: readonly [number, number]): readonly [number, number] => [
        cell[0],
        cell[1],
      ],
    );
    this.lockStart = now;
    this.hasLock = true;
  }

  /**
   * Freeze-frame all overlays at one timestamp.
   * @param nowMs Effect clock timestamp in milliseconds.
   * @returns Snapshot the canvas paints after the live board state.
   */
  public snapshot(nowMs: number): EffectsSnapshot {
    if (!Number.isFinite(nowMs)) {
      return IDLE_SNAPSHOT;
    }
    const clearElapsed: number = this.hasClear
      ? Math.max(0, nowMs - this.clearStart)
      : Number.POSITIVE_INFINITY;
    const lockElapsed: number = this.hasLock
      ? Math.max(0, nowMs - this.lockStart)
      : Number.POSITIVE_INFINITY;
    const shakeElapsed: number = this.hasShake
      ? Math.max(0, nowMs - this.shakeStart)
      : Number.POSITIVE_INFINITY;
    const clearActive: boolean =
      this.hasClear && clearElapsed < CLEAR_COLLAPSE_MS;
    const lockActive: boolean = this.hasLock && lockElapsed < LOCK_FLASH_MS;
    const shakeActive: boolean =
      this.hasShake && shakeElapsed < SHAKE_MS;
    const shake = shakeOffsetFor(shakeElapsed);
    const clear: ClearSnapshot = clearActive
      ? {
          rows: this.clearRows,
          flashAlpha: flashAlphaFor(clearElapsed, CLEAR_FLASH_MS),
          collapse: collapseFor(clearElapsed),
          active: true,
        }
      : IDLE_CLEAR;
    const lock: LockSnapshot = lockActive
      ? {
          cells: this.lockCells,
          flashAlpha: flashAlphaFor(lockElapsed, LOCK_FLASH_MS),
          active: true,
        }
      : IDLE_LOCK;
    return {
      clear,
      lock,
      shakeDx: shake.dx,
      shakeDy: shake.dy,
      shakeActive,
      active: clearActive || lockActive || shakeActive,
    };
  }

  /**
   * True while any flash, collapse, or shake overlay is still visible.
   * @param nowMs Effect clock timestamp in milliseconds.
   * @returns False once every duration has elapsed.
   */
  public isActive(nowMs: number): boolean {
    return this.snapshot(nowMs).active;
  }

  /** Drop every pending overlay so restarts never leak a stale flash. */
  public clear(): void {
    this.clearRows = [];
    this.clearStart = Number.NEGATIVE_INFINITY;
    this.hasClear = false;
    this.lockCells = [];
    this.lockStart = Number.NEGATIVE_INFINITY;
    this.hasLock = false;
    this.shakeStart = Number.NEGATIVE_INFINITY;
    this.hasShake = false;
  }
}

/**
 * Create a fresh juice state machine with no pending overlays.
 * @returns Idle effects instance owned by the render loop.
 */
export function createEffects(): Effects {
  return new Effects();
}
