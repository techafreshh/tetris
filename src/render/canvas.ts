// Canvas2D HiDPI playfield renderer: grid, locked blocks, active, ghost.
// Pure rendering module — reads game state only, never mutates logic.
import { COLS, HIDDEN_ROWS, PIECE_COLORS, ROWS } from "../core/constants";
import { PIECES } from "../core/pieces";
import type { CellOffset, PieceKind } from "../core/pieces";

/** CSS cell size in pixels; canvas CSS box is COLS*24 by ROWS*24. */
export const CSS_CELL_PX: number = 24;

/** Default CSS width of the playfield canvas (COLS * 24). */
export const CSS_WIDTH: number = COLS * CSS_CELL_PX;

/** Default CSS height of the playfield canvas (ROWS * 24). */
export const CSS_HEIGHT: number = ROWS * CSS_CELL_PX;

/** Bag order mapping locked-cell values 1..7 onto guideline colors. */
const BAG_ORDER: readonly PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];

/** Fallback fill for nonzero cells outside the 1..7 bag range. */
const FALLBACK_COLOR: string = "#8888FF";

/** Translucent alpha for the ghost piece fill. */
const GHOST_ALPHA: number = 0.28;

/** Grid line color drawn in CSS-pixel space. */
const GRID_COLOR: string = "rgba(255,255,255,0.08)";

/** Playfield background color. */
const BACKGROUND_COLOR: string = "#000";

/** Falling piece descriptor in board cells (box-top-left origin). */
export interface ActiveRenderPiece {
  /** Tetromino letter. */
  readonly kind: PieceKind;
  /** Box-left x in board cells. */
  readonly x: number;
  /** Box-top y in board cells (row 0 is the top, hidden rows first). */
  readonly y: number;
  /** Rotation state index (0-3). */
  readonly rotation: number;
}

/** Minimal plain state the renderer reads (never mutated). */
export interface RenderState {
  /** Row-major grid; grid[y][x], row 0 is the top (hidden rows first). */
  readonly board: readonly (readonly number[])[];
  /** Falling piece, or null when there is none. */
  readonly active: ActiveRenderPiece | null;
}

/**
 * Map a locked-cell value to its guideline color.
 * @param value Cell value (0 empty, 1..7 bag order I,O,T,S,Z,J,L).
 * @returns Empty string for 0, guideline color for 1..7, fallback otherwise.
 */
export function colorForCell(value: number): string {
  if (value === 0) {
    return "";
  }
  if (Number.isInteger(value) && value >= 1 && value <= BAG_ORDER.length) {
    return PIECE_COLORS[BAG_ORDER[value - 1]];
  }
  return FALLBACK_COLOR;
}

/**
 * Compute the ghost landing origin by stepping the piece down while every
 * cell stays in bounds and on an empty grid cell.
 * @param board Row-major grid (hidden rows first).
 * @param cells Active rotation state cell offsets.
 * @param x Box-left origin x in board cells.
 * @param y Box-top origin y in board cells.
 * @returns Ghost origin y (landing row for the ghost piece preview).
 */
export function computeGhostY(
  board: readonly (readonly number[])[],
  cells: readonly CellOffset[],
  x: number,
  y: number,
): number {
  const rows: number = board.length;
  const cols: number = rows > 0 ? board[0].length : COLS;
  let ghostY: number = y;
  for (;;) {
    const next: number = ghostY + 1;
    let fits: boolean = true;
    for (const cell of cells) {
      const bx: number = x + cell[0];
      const by: number = next + cell[1];
      if (bx < 0 || bx >= cols || by < 0 || by >= rows) {
        fits = false;
        break;
      }
      if (board[by][bx] !== 0) {
        fits = false;
        break;
      }
    }
    if (!fits) {
      break;
    }
    ghostY = next;
  }
  return ghostY;
}

/**
 * Resize a canvas backing store for the current devicePixelRatio.
 * @param canvas Target canvas element.
 * @param cssWidth CSS layout width in pixels.
 * @param cssHeight CSS layout height in pixels.
 * @returns The devicePixelRatio scale applied via setTransform.
 */
export function resizeCanvasForDpr(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): number {
  const raw: unknown =
    typeof window !== "undefined" ? window.devicePixelRatio : undefined;
  const dpr: number =
    typeof raw === "number" && Number.isFinite(raw) && raw >= 1 ? raw : 1;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return dpr;
}

/** Resolve the CSS layout size, preferring live layout then style then default. */
function resolveCssSize(canvas: HTMLCanvasElement): {
  cssWidth: number;
  cssHeight: number;
} {
  let cssWidth: number = CSS_WIDTH;
  let cssHeight: number = CSS_HEIGHT;
  const clientWidth: unknown = (canvas as unknown as { clientWidth?: unknown })
    .clientWidth;
  const clientHeight: unknown = (canvas as unknown as { clientHeight?: unknown })
    .clientHeight;
  if (typeof clientWidth === "number" && clientWidth > 0) {
    cssWidth = clientWidth;
  } else {
    const styleWidth: string | undefined = canvas.style?.width;
    if (typeof styleWidth === "string" && styleWidth.length > 0) {
      const parsed: number = Number.parseFloat(styleWidth);
      if (Number.isFinite(parsed) && parsed > 0) {
        cssWidth = parsed;
      }
    }
  }
  if (typeof clientHeight === "number" && clientHeight > 0) {
    cssHeight = clientHeight;
  } else {
    const styleHeight: string | undefined = canvas.style?.height;
    if (typeof styleHeight === "string" && styleHeight.length > 0) {
      const parsed: number = Number.parseFloat(styleHeight);
      if (Number.isFinite(parsed) && parsed > 0) {
        cssHeight = parsed;
      }
    }
  }
  return { cssWidth, cssHeight };
}

/**
 * Render the 10x20 playfield with locked blocks, ghost preview, active
 * piece, and grid lines at devicePixelRatio sharpness.
 * @param canvas Target canvas element.
 * @param state Plain render state (board grid plus active piece).
 */
export function renderPlayfield(
  canvas: HTMLCanvasElement,
  state: RenderState,
): void {
  const { cssWidth, cssHeight } = resolveCssSize(canvas);
  resizeCanvasForDpr(canvas, cssWidth, cssHeight);
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  const cell: number = Math.min(cssWidth / COLS, cssHeight / ROWS);
  const offsetX: number = (cssWidth - cell * COLS) / 2;
  const offsetY: number = (cssHeight - cell * ROWS) / 2;
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const board: readonly (readonly number[])[] = state.board;
  for (let y = HIDDEN_ROWS; y < board.length; y++) {
    const row: readonly number[] = board[y];
    if (!row) {
      continue;
    }
    for (let x = 0; x < COLS && x < row.length; x++) {
      const value: number = row[x];
      if (value === 0) {
        continue;
      }
      ctx.fillStyle = colorForCell(value);
      ctx.fillRect(
        offsetX + x * cell,
        offsetY + (y - HIDDEN_ROWS) * cell,
        cell,
        cell,
      );
    }
  }
  const active = state.active;
  if (active !== null) {
    const cells: readonly CellOffset[] =
      PIECES[active.kind].states[active.rotation];
    const ghostY: number = computeGhostY(board, cells, active.x, active.y);
    const ghostColor: string = PIECES[active.kind].color;
    if (ghostY !== active.y) {
      ctx.save();
      ctx.globalAlpha = GHOST_ALPHA;
      ctx.fillStyle = ghostColor;
      for (const ghostCell of cells) {
        const bx: number = active.x + ghostCell[0];
        const by: number = ghostY + ghostCell[1];
        if (by < HIDDEN_ROWS) {
          continue;
        }
        if (bx < 0 || bx >= COLS) {
          continue;
        }
        ctx.fillRect(
          offsetX + bx * cell,
          offsetY + (by - HIDDEN_ROWS) * cell,
          cell,
          cell,
        );
      }
      ctx.restore();
      ctx.strokeStyle = ghostColor;
      ctx.lineWidth = 1;
      for (const ghostCell of cells) {
        const bx: number = active.x + ghostCell[0];
        const by: number = ghostY + ghostCell[1];
        if (by < HIDDEN_ROWS) {
          continue;
        }
        if (bx < 0 || bx >= COLS) {
          continue;
        }
        ctx.strokeRect(
          offsetX + bx * cell + 0.5,
          offsetY + (by - HIDDEN_ROWS) * cell + 0.5,
          cell - 1,
          cell - 1,
        );
      }
    }
    ctx.fillStyle = PIECES[active.kind].color;
    for (const activeCell of cells) {
      const bx: number = active.x + activeCell[0];
      const by: number = active.y + activeCell[1];
      if (by < HIDDEN_ROWS) {
        continue;
      }
      if (bx < 0 || bx >= COLS) {
        continue;
      }
      ctx.fillRect(
        offsetX + bx * cell,
        offsetY + (by - HIDDEN_ROWS) * cell,
        cell,
        cell,
      );
    }
  }
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= COLS; gx++) {
    const px: number = offsetX + gx * cell + 0.5;
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + ROWS * cell);
  }
  for (let gy = 0; gy <= ROWS; gy++) {
    const py: number = offsetY + gy * cell + 0.5;
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + COLS * cell, py);
  }
  ctx.stroke();
}
