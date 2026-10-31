// Pure Tetris game state machine: gravity, lock delay, hold, top-out.
// Pure logic module — no DOM, no requestAnimationFrame, dt in ms.
// Depends on pieces (spawn states + SRS kicks), bag (7-bag stream),
// board (grid + line clears), and constants (tuning tables).
import {
  COLS,
  HARD_DROP_POINTS_PER_CELL,
  HIDDEN_ROWS,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  SOFT_DROP_POINTS_PER_CELL,
  gravityIntervalMsForLevel,
} from "./constants";
import { PIECES, SRS_KICKS_I, SRS_KICKS_JLSTZ } from "./pieces";
import type { PieceKind, SrsKickKey } from "./pieces";
import { createBag } from "./bag";
import type { Bag } from "./bag";
import { clearLines, createBoard, findFullRows } from "./board";
import type { Board } from "./board";
import { isDifficultClear, scoreLineClear } from "./scoring";

export type { PieceKind };

/** Lifecycle state of a game. `menu` is reserved for the future boot flow. */
export type GameState = "menu" | "playing" | "paused" | "gameover";

/** Live falling piece: box-left board position plus rotation state 0-3. */
export interface ActivePiece {
  /** Tetromino letter. */
  readonly kind: PieceKind;
  /** Box-left x in board cells. */
  readonly x: number;
  /** Box-top y in board cells (row 0 is the top). */
  readonly y: number;
  /** Rotation state index (0, 1=R, 2, 3=L). */
  readonly rotation: number;
}

/** Maximum lock-delay resets per piece via successful grounded moves/rotates. */
export const MAX_LOCK_RESETS: number = 15;

/** Board cell coordinate in absolute cells (box position plus offset). */
export type LockCell = readonly [number, number];

/**
 * Renderer-only record of one lock: stamped cells, pre-clear full rows,
 * cleared count, T-spin flag, and a monotonic sequence number.
 * Written synchronously in `lockPiece`; effects read it, never block it.
 */
export interface LockEvent {
  /** Absolute stamped cells of the locked piece (in-bounds only). */
  readonly cells: readonly LockCell[];
  /** Pre-clear full-row indices (ascending, hidden rows included). */
  readonly rows: readonly number[];
  /** Rows removed by this lock. */
  readonly count: number;
  /** True when the lock scored as a T-spin. */
  readonly tSpin: boolean;
  /** Monotonic sequence; polled once per frame by the render loop. */
  readonly seq: number;
}

/** Rotation state names used to build SRS kick-table keys. */
const ROTATION_NAMES: readonly string[] = ["0", "R", "2", "L"];

/** Build an SRS kick-table key for a from -> to rotation transition. */
function kickKey(from: number, to: number): SrsKickKey {
  return `${ROTATION_NAMES[from]}>${ROTATION_NAMES[to]}` as SrsKickKey;
}

/** Box-left spawn x for a kind (O spawns one cell right to stay centered). */
function spawnXFor(kind: PieceKind): number {
  return kind === "O" ? 4 : 3;
}

/**
 * Pure Tetris rules engine driven by explicit dt in milliseconds.
 * Create via {@link createGame}; drive with `update` plus input actions.
 */
export class Game {
  /** Lifecycle state. */
  public state: GameState = "playing";
  /** Total score (line clears plus drop points). */
  public score: number = 0;
  /** Total lines cleared. */
  public lines: number = 0;
  /** Current level (`floor(lines / LINES_PER_LEVEL) + 1`). */
  public level: number = 1;
  /** Held piece letter, or null before the first hold. */
  public held: PieceKind | null = null;
  /** True while the current piece may be held. */
  public canHold: boolean = true;
  /** Consecutive scoring clears (-1 means no chain). */
  public combo: number = -1;
  /** Total pieces locked this run (for PPS). */
  public piecesPlaced: number = 0;
  /** Total locks this run (diffed for lock/clear fanfare, y-independent). */
  public locks: number = 0;
  /** Highest combo chain reached this run (0 means none or one isolated clear). */
  public maxCombo: number = 0;
  /** True when the last scoring clear was difficult. */
  public backToBack: boolean = false;
  /** Sticky uppercase banner for the last scoring event. */
  public lastEvent: string = "";

  /** Internal playfield. */
  private boardState: Board = createBoard();
  /** Internal falling piece, null when over or between pieces. */
  private activeState: ActivePiece | null = null;
  /** Internal 5-piece preview queue. */
  private queue: PieceKind[] = [];
  /** Internal bag stream. */
  private bag: Bag = createBag(0);
  /** Normalized seed reused when `start()` is called without one. */
  private seed: number = 0;
  /** Time since the last gravity step while floating. */
  private fallTimer: number = 0;
  /** Time spent grounded for the current lock-delay window. */
  private lockTimer: number = 0;
  /** Lock resets consumed by the current piece. */
  private resetsUsed: number = 0;
  /** True when the last successful action before lock was a rotation. */
  private lastActionWasRotate: boolean = false;
  /** Latest lock record for the renderer; null until the first lock. */
  public lastLockEvent: LockEvent | null = null;
  /** Monotonic lock counter; reset to 0 by `start`. */
  public lockSeq: number = 0;

  /**
   * Create a game that starts in `playing` with an active piece.
   * @param seed Seed for the deterministic 7-bag stream.
   */
  public constructor(seed: number) {
    this.seed = seed >>> 0;
    this.start(this.seed);
  }

  /** Live grid for rendering and test setup (mutable by design). */
  public get board(): number[][] {
    return this.boardState.grid;
  }

  /** Copy of the falling piece, or null when there is none. */
  public get active(): ActivePiece | null {
    if (this.activeState === null) {
      return null;
    }
    return { ...this.activeState };
  }

  /** Copy of the 5-piece preview queue. */
  public get next(): PieceKind[] {
    return [...this.queue];
  }

  /**
   * Reset all progress and enter `playing` with a fresh piece.
   * @param seed Optional new seed; defaults to the construction seed.
   */
  public start(seed?: number): void {
    if (seed !== undefined) {
      this.seed = seed >>> 0;
    }
    this.bag = createBag(this.seed);
    this.boardState = createBoard();
    this.queue = [];
    for (let i: number = 0; i < 5; i++) {
      this.queue.push(this.bag.next());
    }
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.held = null;
    this.canHold = true;
    this.combo = -1;
    this.piecesPlaced = 0;
    this.locks = 0;
    this.maxCombo = 0;
    this.backToBack = false;
    this.lastEvent = "";
    this.lastActionWasRotate = false;
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.resetsUsed = 0;
    this.lastLockEvent = null;
    this.lockSeq = 0;
    this.state = "playing";
    this.spawnNext();
  }

  /** Freeze time and input while keeping the current piece. */
  public pause(): void {
    if (this.state !== "playing") {
      return;
    }
    this.state = "paused";
  }

  /** Resume a paused game. */
  public resume(): void {
    if (this.state !== "paused") {
      return;
    }
    this.state = "playing";
  }

  /**
   * Advance the simulation by dt milliseconds: gravity steps while
   * floating, lock-delay accumulation while grounded.
   * @param dtMs Elapsed time in milliseconds; ignored unless finite and positive.
   */
  public update(dtMs: number): void {
    if (this.state !== "playing") {
      return;
    }
    if (this.activeState === null) {
      return;
    }
    if (!Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }
    let remaining: number = dtMs;
    while (remaining > 0 && this.state === "playing" && this.activeState !== null) {
      if (this.isGrounded()) {
        this.fallTimer = 0;
        this.lockTimer += remaining;
        remaining = 0;
        if (this.lockTimer >= LOCK_DELAY_MS) {
          this.lockPiece();
        }
      } else {
        this.lockTimer = 0;
        const interval: number = gravityIntervalMsForLevel(this.level);
        const timeToFall: number = interval - this.fallTimer;
        if (remaining < timeToFall) {
          this.fallTimer += remaining;
          remaining = 0;
        } else {
          remaining -= timeToFall;
          this.fallTimer = 0;
          const current: ActivePiece = this.activeState as ActivePiece;
          this.activeState = { ...current, y: current.y + 1 };
        }
      }
    }
  }

  /**
   * Shift the active piece one cell left.
   * @returns True when the piece moved.
   */
  public moveLeft(): boolean {
    if (this.state !== "playing" || this.activeState === null) {
      return false;
    }
    const current: ActivePiece = this.activeState;
    if (this.collidesAt(current.kind, current.rotation, current.x - 1, current.y)) {
      return false;
    }
    this.activeState = { ...current, x: current.x - 1 };
    this.lastActionWasRotate = false;
    this.tryResetLock();
    return true;
  }

  /**
   * Shift the active piece one cell right.
   * @returns True when the piece moved.
   */
  public moveRight(): boolean {
    if (this.state !== "playing" || this.activeState === null) {
      return false;
    }
    const current: ActivePiece = this.activeState;
    if (this.collidesAt(current.kind, current.rotation, current.x + 1, current.y)) {
      return false;
    }
    this.activeState = { ...current, x: current.x + 1 };
    this.lastActionWasRotate = false;
    this.tryResetLock();
    return true;
  }

  /**
   * Rotate the active piece clockwise with SRS kicks.
   * @returns True when the rotation applied.
   */
  public rotateCW(): boolean {
    return this.rotateTo(((this.activeState?.rotation ?? 0) + 1) % 4);
  }

  /**
   * Rotate the active piece counter-clockwise with SRS kicks.
   * @returns True when the rotation applied.
   */
  public rotateCCW(): boolean {
    return this.rotateTo(((this.activeState?.rotation ?? 0) + 3) % 4);
  }

  /**
   * Drop the active piece one cell and score a soft-drop point.
   * Never resets lock delay.
   * @returns True when the piece moved down.
   */
  public softDrop(): boolean {
    if (this.state !== "playing" || this.activeState === null) {
      return false;
    }
    const current: ActivePiece = this.activeState;
    if (this.collidesAt(current.kind, current.rotation, current.x, current.y + 1)) {
      return false;
    }
    this.activeState = { ...current, y: current.y + 1 };
    this.score += SOFT_DROP_POINTS_PER_CELL;
    this.fallTimer = 0;
    return true;
  }

  /**
   * Drop the active piece to the stack, score hard-drop points, and lock.
   * @returns Cells travelled (0 when there is no active piece).
   */
  public hardDrop(): number {
    if (this.state !== "playing" || this.activeState === null) {
      return 0;
    }
    let distance: number = 0;
    while (
      !this.collidesAt(
        (this.activeState as ActivePiece).kind,
        (this.activeState as ActivePiece).rotation,
        (this.activeState as ActivePiece).x,
        (this.activeState as ActivePiece).y + 1,
      )
    ) {
      const current: ActivePiece = this.activeState as ActivePiece;
      this.activeState = { ...current, y: current.y + 1 };
      distance++;
    }
    this.score += distance * HARD_DROP_POINTS_PER_CELL;
    this.lockPiece();
    return distance;
  }

  /**
   * Swap the active piece with the held piece (once per piece).
   * Resets gravity and lock timers plus the reset budget for the new piece.
   */
  public hold(): void {
    if (this.state !== "playing" || this.activeState === null) {
      return;
    }
    if (!this.canHold) {
      return;
    }
    const current: ActivePiece = this.activeState;
    if (this.held === null) {
      this.held = current.kind;
      this.spawnNext();
      if (this.state !== "playing") {
        return;
      }
    } else {
      const swapped: PieceKind = this.held;
      this.held = current.kind;
      const x: number = spawnXFor(swapped);
      if (this.collidesAt(swapped, 0, x, 0)) {
        this.activeState = null;
        this.state = "gameover";
        this.canHold = false;
        return;
      }
      this.activeState = { kind: swapped, x, y: 0, rotation: 0 };
    }
    this.canHold = false;
    this.lastActionWasRotate = false;
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.resetsUsed = 0;
  }

  /** True when the active piece cannot move down one cell. */
  private isGrounded(): boolean {
    if (this.activeState === null) {
      return false;
    }
    return this.collidesAt(
      this.activeState.kind,
      this.activeState.rotation,
      this.activeState.x,
      this.activeState.y + 1,
    );
  }

  /**
   * True when a kind/rotation at a box position hits a wall, the floor,
   * or a locked cell.
   */
  private collidesAt(kind: PieceKind, rotation: number, px: number, py: number): boolean {
    const cells = PIECES[kind].states[rotation];
    for (const [cx, cy] of cells) {
      const bx: number = px + cx;
      const by: number = py + cy;
      if (bx < 0 || bx >= COLS || by < 0 || by >= this.boardState.rows) {
        return true;
      }
      if (this.boardState.grid[by][bx] !== 0) {
        return true;
      }
    }
    return false;
  }

  /** Zero the lock timer for a successful grounded move while budget remains. */
  private tryResetLock(): void {
    if (this.activeState === null) {
      return;
    }
    if (!this.isGrounded()) {
      return;
    }
    if (this.resetsUsed >= MAX_LOCK_RESETS) {
      return;
    }
    this.resetsUsed++;
    this.lockTimer = 0;
  }

  /** Rotate to an absolute rotation state via SRS kick trials. */
  private rotateTo(target: number): boolean {
    if (this.state !== "playing" || this.activeState === null) {
      return false;
    }
    const current: ActivePiece = this.activeState;
    if (current.rotation === target) {
      return false;
    }
    if (current.kind === "O") {
      return false;
    }
    const table = current.kind === "I" ? SRS_KICKS_I : SRS_KICKS_JLSTZ;
    const offsets = table[kickKey(current.rotation, target)];
    for (const [sx, sy] of offsets) {
      const nx: number = current.x + sx;
      const ny: number = current.y - sy;
      if (!this.collidesAt(current.kind, target, nx, ny)) {
        this.activeState = { ...current, x: nx, y: ny, rotation: target };
        this.lastActionWasRotate = true;
        this.tryResetLock();
        return true;
      }
    }
    return false;
  }

  /** Consume the preview queue head and spawn it; blocked spawn ends the game. */
  private spawnNext(): void {
    const kind: PieceKind = this.queue.shift() as PieceKind;
    this.queue.push(this.bag.next());
    const x: number = spawnXFor(kind);
    this.lastActionWasRotate = false;
    if (this.collidesAt(kind, 0, x, 0)) {
      this.activeState = null;
      this.state = "gameover";
      return;
    }
    this.activeState = { kind, x, y: 0, rotation: 0 };
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.resetsUsed = 0;
    this.canHold = true;
  }

  /** True when a T piece locked after a rotation is surrounded on 3+ corners. */
  private detectTSpin(piece: ActivePiece): boolean {
    if (piece.kind !== "T") {
      return false;
    }
    if (!this.lastActionWasRotate) {
      return false;
    }
    const cx: number = piece.x + 1;
    const cy: number = piece.y + 1;
    const corners: readonly (readonly [number, number])[] = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ];
    let occupied: number = 0;
    for (const [bx, by] of corners) {
      if (bx < 0 || bx >= COLS || by < 0 || by >= this.boardState.rows) {
        occupied++;
        continue;
      }
      if (this.boardState.grid[by][bx] !== 0) {
        occupied++;
      }
    }
    return occupied >= 3;
  }

  /** Score one clear event: lines, level, combo, back-to-back, and banner. */
  private applyClear(cleared: number, tSpin: boolean): void {
    if (cleared <= 0) {
      this.combo = -1;
      if (tSpin) {
        this.lastEvent = "T-SPIN";
      }
      return;
    }
    const capped: number = Math.min(Math.trunc(cleared), 4);
    const previousLevel: number = this.level;
    const previousBackToBack: boolean = this.backToBack;
    const difficult: boolean = isDifficultClear(capped, tSpin);
    this.lines += Math.trunc(cleared);
    this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
    this.combo += 1;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    this.score += scoreLineClear(capped, this.level, {
      backToBack: previousBackToBack,
      combo: this.combo,
      tSpin,
    });
    this.backToBack = difficult;
    let base: string;
    if (tSpin) {
      const cappedT: number = Math.min(capped, 3);
      if (cappedT <= 1) {
        base = "T-SPIN SINGLE";
      } else if (cappedT === 2) {
        base = "T-SPIN DOUBLE";
      } else {
        base = "T-SPIN TRIPLE";
      }
    } else if (capped === 1) {
      base = "SINGLE";
    } else if (capped === 2) {
      base = "DOUBLE";
    } else if (capped === 3) {
      base = "TRIPLE";
    } else {
      base = "TETRIS!";
    }
    let event: string = "";
    if (previousBackToBack && difficult) {
      event += "BACK-TO-BACK ";
    }
    event += base;
    if (this.combo >= 1) {
      event += ` COMBO x${this.combo}`;
    }
    if (this.level > previousLevel) {
      event += " LEVEL UP!";
    }
    this.lastEvent = event;
  }

  /**
   * Force a synthetic clear for probes: scores without touching the grid.
   * @param lines Lines to score (floored, clamped 0-4, non-finite becomes 0).
   * @param tSpin True to score the clear as a T-spin.
   */
  public debugClear(lines: number, tSpin: boolean = false): void {
    if (this.state !== "playing") {
      return;
    }
    let normalized: number = 0;
    if (Number.isFinite(lines)) {
      normalized = Math.floor(lines);
    }
    if (normalized < 0) {
      normalized = 0;
    }
    if (normalized > 4) {
      normalized = 4;
    }
    this.applyClear(normalized, tSpin === true);
  }

  /** Stamp the active piece, score clears, and spawn the next piece. */
  private lockPiece(): void {
    if (this.activeState === null) {
      return;
    }
    const piece: ActivePiece = this.activeState;
    const tSpin: boolean = this.detectTSpin(piece);
    const cells = PIECES[piece.kind].states[piece.rotation];
    for (const [cx, cy] of cells) {
      const bx: number = piece.x + cx;
      const by: number = piece.y + cy;
      if (bx < 0 || bx >= COLS || by < 0 || by >= this.boardState.rows) {
        continue;
      }
      this.boardState.grid[by][bx] = 1;
    }
    const blockOut: boolean = cells.every(
      ([, cy]: readonly [number, number]): boolean => piece.y + cy < HIDDEN_ROWS,
    );
    const rows: number[] = findFullRows(this.boardState);
    const cleared = clearLines(this.boardState).count;
    this.piecesPlaced += 1;
    this.applyClear(cleared, tSpin);
    this.lockSeq += 1;
    const stamped: LockCell[] = [];
    for (const [cx, cy] of cells) {
      const bx: number = piece.x + cx;
      const by: number = piece.y + cy;
      if (bx < 0 || bx >= COLS || by < 0 || by >= this.boardState.rows) {
        continue;
      }
      stamped.push([bx, by]);
    }
    this.lastLockEvent = {
      cells: stamped,
      rows,
      count: cleared,
      tSpin,
      seq: this.lockSeq,
    };
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.resetsUsed = 0;
    this.canHold = true;
    if (blockOut) {
      this.activeState = null;
      this.state = "gameover";
      this.locks += 1;
      return;
    }
    this.spawnNext();
    this.locks += 1;
  }
}

/**
 * Create a game in `playing` with an active piece and a 5-piece preview.
 * @param seed Seed for the deterministic 7-bag stream.
 * @returns A new playing game.
 */
export function createGame(seed: number): Game {
  return new Game(seed);
}
