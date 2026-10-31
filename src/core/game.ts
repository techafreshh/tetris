// Pure Tetris game state machine: gravity, lock delay, hold, top-out.
// Pure logic module — no DOM, no requestAnimationFrame, dt in ms.
// Depends on pieces (spawn states + SRS kicks), bag (7-bag stream),
// board (grid + line clears), and constants (tuning tables).
import {
  COLS,
  HARD_DROP_POINTS_PER_CELL,
  HIDDEN_ROWS,
  LINES_PER_LEVEL,
  LINE_CLEAR_SCORES,
  LOCK_DELAY_MS,
  SOFT_DROP_POINTS_PER_CELL,
  gravityIntervalMsForLevel,
} from "./constants";
import { PIECES, SRS_KICKS_I, SRS_KICKS_JLSTZ } from "./pieces";
import type { PieceKind, SrsKickKey } from "./pieces";
import { createBag } from "./bag";
import type { Bag } from "./bag";
import { clearLines, createBoard } from "./board";
import type { Board } from "./board";

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
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.resetsUsed = 0;
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

  /** Stamp the active piece, score clears, and spawn the next piece. */
  private lockPiece(): void {
    if (this.activeState === null) {
      return;
    }
    const piece: ActivePiece = this.activeState;
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
    const cleared = clearLines(this.boardState).count;
    if (cleared > 0) {
      const capped: number = Math.min(cleared, 4);
      this.lines += cleared;
      this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
      this.score += LINE_CLEAR_SCORES[capped] * this.level;
    }
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.resetsUsed = 0;
    this.canHold = true;
    if (blockOut) {
      this.activeState = null;
      this.state = "gameover";
      return;
    }
    this.spawnNext();
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
