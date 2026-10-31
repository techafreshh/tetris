import { describe, expect, it } from "vitest";
import { COLS } from "./constants";
import { createGame } from "./game";

describe("scoring-integration", (): void => {
  it("B2B Tetris pair totals 2050 with combo and banner", (): void => {
    const game = createGame(0);
    game.debugClear(4);
    expect(game.score).toBe(800);
    game.debugClear(4);
    expect(game.score).toBe(2050);
    expect(game.backToBack).toBe(true);
    expect(game.combo).toBe(1);
    expect(game.lastEvent).toContain("TETRIS");
    expect(game.lastEvent).toContain("BACK-TO-BACK");
    expect(game.lastEvent).toContain("COMBO x1");
  });

  it("natural single lock scores drop points plus 100 with SINGLE banner", (): void => {
    const game = createGame(0);
    const bottom: number = game.board.length - 1;
    for (let x: number = 0; x < COLS; x++) {
      game.board[bottom][x] = 1;
    }
    const travelled: number = game.hardDrop();
    expect(game.lines).toBe(1);
    expect(game.score).toBe(travelled * 2 + 100);
    expect(game.lastEvent).toContain("SINGLE");
  });

  it("ten singles reach level 2 with LEVEL banner", (): void => {
    const game = createGame(0);
    for (let i: number = 0; i < 10; i++) {
      game.debugClear(1);
    }
    expect(game.lines).toBe(10);
    expect(game.level).toBe(2);
    expect(game.lastEvent).toContain("LEVEL");
  });
});
