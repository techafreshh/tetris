// Board grid: collision world, piece locking, and line clears.
// Pure logic module — no DOM, no rendering, no timing APIs.
// Row 0 is the top (hidden spawn rows first); cells are numbers
// (0 empty, nonzero filled) so locked cells can carry piece ids later.
import { COLS, HIDDEN_ROWS, ROWS } from "./constants";

/** Mutable 2D grid of cells: 0 empty, nonzero filled. */
export type BoardGrid = number[][];

/** Board state wrapping dimensions plus the cell grid. */
export interface Board {
  /** Playfield width in cells. */
  readonly cols: number;
  /** Playfield height in cells (visible rows plus hidden rows). */
  readonly rows: number;
  /** Row-major grid; grid[y][x], row 0 is the top. */
  grid: BoardGrid;
}

/** Result of clearing full rows: how many and the new grid. */
export interface ClearLinesResult {
  /** Number of full rows removed. */
  readonly count: number;
  /** Fresh grid with empty rows prepended (same object as board.grid). */
  readonly grid: BoardGrid;
}

/** Occupancy matrix accepted by collides/placePiece (any nonzero cell is solid). */
export type OccupancyMatrix = readonly (readonly number[])[];

/** Create an empty board, defaulting to COLS x (ROWS + HIDDEN_ROWS). */
export function createBoard(
  cols: number = COLS,
  rows: number = ROWS + HIDDEN_ROWS,
): Board {
  const grid: BoardGrid = [];
  for (let y = 0; y < rows; y++) {
    grid.push(new Array<number>(cols).fill(0));
  }
  return { cols, rows, grid };
}

/**
 * Return true when the matrix placed at (x, y) collides: any filled matrix
 * cell outside the board bounds or overlapping a filled board cell.
 * Empty (0) matrix cells never collide, even out of bounds.
 */
export function collides(
  board: Board,
  matrix: OccupancyMatrix,
  x: number,
  y: number,
): boolean {
  for (let dy = 0; dy < matrix.length; dy++) {
    const row: readonly number[] = matrix[dy];
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx] === 0) {
        continue;
      }
      const bx: number = x + dx;
      const by: number = y + dy;
      if (bx < 0 || bx >= board.cols || by < 0 || by >= board.rows) {
        return true;
      }
      if (board.grid[by][bx] !== 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Stamp nonzero matrix cells with value into the board grid at (x, y).
 * Out-of-bounds filled cells are ignored. Returns the same board.
 */
export function placePiece(
  board: Board,
  matrix: OccupancyMatrix,
  x: number,
  y: number,
  value: number = 1,
): Board {
  for (let dy = 0; dy < matrix.length; dy++) {
    const row: readonly number[] = matrix[dy];
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx] === 0) {
        continue;
      }
      const bx: number = x + dx;
      const by: number = y + dy;
      if (bx < 0 || bx >= board.cols || by < 0 || by >= board.rows) {
        continue;
      }
      board.grid[by][bx] = value;
    }
  }
  return board;
}

/** Return ascending indices of rows where every cell is nonzero. */
export function findFullRows(board: Board): number[] {
  const full: number[] = [];
  for (let y = 0; y < board.rows; y++) {
    const row: number[] = board.grid[y];
    let isFull: boolean = true;
    for (let x = 0; x < board.cols; x++) {
      if (row[x] === 0) {
        isFull = false;
        break;
      }
    }
    if (isFull) {
      full.push(y);
    }
  }
  return full;
}

/**
 * Remove every full row, prepend one empty row per removed line to preserve
 * board height, assign the fresh grid to the board, and return count and grid.
 */
export function clearLines(board: Board): ClearLinesResult {
  const kept: BoardGrid = [];
  for (let y = 0; y < board.rows; y++) {
    const row: number[] = board.grid[y];
    let isFull: boolean = true;
    for (let x = 0; x < board.cols; x++) {
      if (row[x] === 0) {
        isFull = false;
        break;
      }
    }
    if (!isFull) {
      kept.push(row);
    }
  }
  const count: number = board.rows - kept.length;
  for (let i = 0; i < count; i++) {
    kept.unshift(new Array<number>(board.cols).fill(0));
  }
  board.grid = kept;
  return { count, grid: board.grid };
}
