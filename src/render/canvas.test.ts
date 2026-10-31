import { describe, expect, it } from "vitest";
import { COLS, PIECE_COLORS } from "../core/constants";
import { PIECES } from "../core/pieces";
import {
  colorForCell,
  computeGhostY,
  resizeCanvasForDpr,
} from "./canvas";

function emptyBoard(rows: number = 22, cols: number = 10): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < rows; y++) {
    grid.push(new Array<number>(cols).fill(0));
  }
  return grid;
}

interface FakeCtx {
  calls: string[];
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillStyle: string;
  strokeStyle: string;
  globalAlpha: number;
  lineWidth: number;
}

function makeFakeCtx(): FakeCtx {
  return {
    calls: [],
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
      this.calls.push(`setTransform(${a},${b},${c},${d},${e},${f})`);
    },
    fillRect(): void {},
    strokeRect(): void {},
    save(): void {},
    restore(): void {},
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    stroke(): void {},
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  };
}

function makeFakeCanvas(ctx: FakeCtx): unknown {
  return {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext(): FakeCtx {
      return ctx;
    },
  };
}

describe("computeGhostY", (): void => {
  it("stops on the floor for an O piece on an empty board", (): void => {
    const board: number[][] = emptyBoard();
    const cells = PIECES["O"].states[0];
    const ghost: number = computeGhostY(board, cells, 4, 0);
    expect(ghost).toBe(board.length - 2);
    expect(ghost).toBeGreaterThan(0);
  });

  it("stops on a stacked row for a T piece above a block", (): void => {
    const board: number[][] = emptyBoard();
    const bottom: number = board.length - 1;
    for (let x = 0; x < COLS; x++) {
      board[bottom][x] = 1;
    }
    const cells = PIECES["T"].states[0];
    const ghost: number = computeGhostY(board, cells, 3, 0);
    expect(ghost).toBe(bottom - 2);
  });

  it("equals the active origin on a flat-full stack (caller skips drawing)", (): void => {
    const board: number[][] = emptyBoard();
    for (let y = 1; y < board.length; y++) {
      for (let x = 0; x < COLS; x++) {
        board[y][x] = 1;
      }
    }
    const cells = PIECES["O"].states[0];
    const ghost: number = computeGhostY(board, cells, 0, 0);
    expect(ghost).toBe(0);
  });
});

describe("colorForCell", (): void => {
  it("maps 0 to empty and 1..7 onto guideline piece colors", (): void => {
    expect(colorForCell(0)).toBe("");
    const members: string[] = Object.values(PIECE_COLORS);
    for (let value = 1; value <= 7; value++) {
      expect(members).toContain(colorForCell(value));
    }
  });
});

describe("resizeCanvasForDpr", (): void => {
  it("scales the backing store by 2 and resets the transform at DPR 2", (): void => {
    const previous = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = {
      devicePixelRatio: 2,
    };
    try {
      const ctx: FakeCtx = makeFakeCtx();
      const canvas = makeFakeCanvas(ctx) as unknown as HTMLCanvasElement;
      resizeCanvasForDpr(canvas, 240, 480);
      expect(canvas.width).toBe(240 * 2);
      expect(canvas.height).toBe(480 * 2);
      expect(ctx.calls).toContain("setTransform(2,0,0,2,0,0)");
    } finally {
      if (previous === undefined) {
        delete (globalThis as unknown as { window?: unknown }).window;
      } else {
        (globalThis as unknown as { window: unknown }).window = previous;
      }
    }
  });
});
