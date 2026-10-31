import { describe, expect, it } from "vitest";
import {
  clearLines,
  collides,
  createBoard,
  findFullRows,
  placePiece,
} from "./board";

const BLOCK_2X2: readonly (readonly number[])[] = [
  [1, 1],
  [1, 1],
];

describe("createBoard", (): void => {
  it("creates an empty 10x22 board with zero full rows", (): void => {
    const board = createBoard();
    expect(board.cols).toBe(10);
    expect(board.rows).toBe(22);
    expect(board.grid).toHaveLength(22);
    for (const row of board.grid) {
      expect(row).toHaveLength(10);
    }
    expect(findFullRows(board)).toEqual([]);
  });
});

describe("collides", (): void => {
  it("wall blocks a 2x2 block at x=-1 but not at x=0 on an empty board", (): void => {
    const board = createBoard();
    expect(collides(board, BLOCK_2X2, -1, 0)).toBe(true);
    expect(collides(board, BLOCK_2X2, 0, 0)).toBe(false);
  });

  it("floor collision below the last row", (): void => {
    const board = createBoard();
    expect(collides(board, BLOCK_2X2, 0, board.rows - 1)).toBe(true);
    expect(collides(board, BLOCK_2X2, 0, board.rows - 2)).toBe(false);
  });

  it("stacked cells collide after placePiece", (): void => {
    const board = createBoard();
    placePiece(board, BLOCK_2X2, 0, 0);
    expect(collides(board, BLOCK_2X2, 0, 0)).toBe(true);
    expect(collides(board, BLOCK_2X2, 2, 0)).toBe(false);
  });
});

describe("placePiece", (): void => {
  it("stamps cells with the given value", (): void => {
    const board = createBoard();
    placePiece(board, BLOCK_2X2, 0, 0);
    expect(board.grid[0][0]).toBe(1);
    expect(board.grid[0][1]).toBe(1);
    expect(board.grid[1][0]).toBe(1);
    expect(board.grid[1][1]).toBe(1);
    expect(board.grid[0][2]).toBe(0);
  });
});

describe("clearLines", (): void => {
  it("placing a full row yields clearLines count 1 with height preserved", (): void => {
    const board = createBoard();
    const bottom: number = board.rows - 1;
    placePiece(
      board,
      [new Array<number>(board.cols).fill(1)],
      0,
      bottom,
    );
    expect(findFullRows(board)).toEqual([bottom]);
    const result = clearLines(board);
    expect(result.count).toBe(1);
    expect(result.grid).toHaveLength(22);
    expect(board.grid).toHaveLength(22);
    expect(findFullRows(board)).toEqual([]);
  });

  it("multi-row clear returns the correct count", (): void => {
    const board = createBoard();
    placePiece(
      board,
      [new Array<number>(board.cols).fill(1)],
      0,
      board.rows - 1,
    );
    placePiece(
      board,
      [new Array<number>(board.cols).fill(1)],
      0,
      board.rows - 2,
    );
    const result = clearLines(board);
    expect(result.count).toBe(2);
    expect(result.grid).toHaveLength(22);
    expect(findFullRows(board)).toEqual([]);
  });
});
