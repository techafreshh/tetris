// Behavior tests for the pure game state machine.
import { describe, expect, it } from "vitest";
import { COLS, HIDDEN_ROWS, ROWS, gravityIntervalMsForLevel } from "./constants";
import { createGame } from "./game";

function countCells(grid: number[][]): number {
  let total: number = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== 0) {
        total++;
      }
    }
  }
  return total;
}

function groundActive(seed: number): ReturnType<typeof createGame> {
  const game = createGame(seed);
  let guard: number = 0;
  while (game.softDrop() && guard < 100) {
    guard++;
  }
  return game;
}

describe("boot state", (): void => {
  it("starts playing with a 5-piece preview and an empty 22x10 board", (): void => {
    const game = createGame(1);
    expect(game.state).toBe("playing");
    expect(game.active).not.toBeNull();
    expect(game.next).toHaveLength(5);
    expect(game.board).toHaveLength(ROWS + HIDDEN_ROWS);
    for (const row of game.board) {
      expect(row).toHaveLength(COLS);
    }
    expect(countCells(game.board)).toBe(0);
    expect(game.score).toBe(0);
    expect(game.lines).toBe(0);
    expect(game.level).toBe(1);
    expect(game.held).toBeNull();
    expect(game.canHold).toBe(true);
  });
});

describe("run counters", (): void => {
  it("starts at zero pieces and zero max combo", (): void => {
    const game = createGame(1);
    expect(game.piecesPlaced).toBe(0);
    expect(game.maxCombo).toBe(0);
  });

  it("counts locks and tracks the highest combo chain", (): void => {
    const game = createGame(7);
    game.debugClear(1);
    expect(game.combo).toBe(0);
    expect(game.maxCombo).toBe(0);
    game.debugClear(1);
    expect(game.combo).toBe(1);
    expect(game.maxCombo).toBe(1);
    game.debugClear(0);
    expect(game.combo).toBe(-1);
    expect(game.maxCombo).toBe(1);
  });

  it("increments piecesPlaced once per hardDrop lock", (): void => {
    const game = createGame(42);
    expect(game.piecesPlaced).toBe(0);
    game.hardDrop();
    expect(game.piecesPlaced).toBe(1);
    game.hardDrop();
    expect(game.piecesPlaced).toBe(2);
  });

  it("resets counters on start", (): void => {
    const game = createGame(8);
    game.hardDrop();
    game.debugClear(1);
    game.debugClear(1);
    expect(game.piecesPlaced).toBeGreaterThan(0);
    game.start();
    expect(game.piecesPlaced).toBe(0);
    expect(game.maxCombo).toBe(0);
    expect(game.combo).toBe(-1);
  });
});

describe("hardDrop", (): void => {
  it("locks a piece, spawns the next, and grows score with 4 new cells", (): void => {
    const game = createGame(42);
    const first = game.active?.kind;
    expect(first).toBeDefined();
    const before: number = countCells(game.board);
    const travelled: number = game.hardDrop();
    expect(travelled).toBeGreaterThan(0);
    expect(countCells(game.board)).toBe(before + 4);
    expect(game.active).not.toBeNull();
    expect(game.active?.kind).toBeDefined();
    expect(game.score).toBeGreaterThan(0);
    expect(game.canHold).toBe(true);
  });

  it("clears a prefilled bottom row for lines === 1 with line score", (): void => {
    const game = createGame(7);
    const bottom: number = game.board.length - 1;
    for (let x: number = 0; x < COLS; x++) {
      game.board[bottom][x] = 1;
    }
    const scoreBefore: number = game.score;
    game.hardDrop();
    expect(game.lines).toBe(1);
    expect(game.score).toBeGreaterThan(scoreBefore);
  });
});

describe("hold", (): void => {
  it("swaps once then blocks until lock, and swaps back after lock", (): void => {
    const game = createGame(99);
    const first = game.active?.kind as string;
    game.hold();
    expect(game.held).toBe(first);
    expect(game.canHold).toBe(false);
    const second = game.active?.kind as string;
    game.hold();
    expect(game.active?.kind).toBe(second);
    game.hardDrop();
    expect(game.canHold).toBe(true);
    const heldBefore = game.held as string;
    const activeBefore = game.active?.kind as string;
    game.hold();
    expect(game.held).toBe(activeBefore);
    expect(game.active?.kind).toBe(heldBefore);
    expect(game.canHold).toBe(false);
  });
});

describe("top-out", (): void => {
  it("blocked spawn sets gameover", (): void => {
    const game = createGame(1234);
    for (let y: number = 0; y < HIDDEN_ROWS; y++) {
      for (let x: number = 0; x < COLS; x++) {
        game.board[y][x] = 1;
      }
    }
    game.hardDrop();
    expect(game.state).toBe("gameover");
    expect(game.active).toBeNull();
  });
});

describe("lock delay", (): void => {
  it("locks a grounded piece after update(600) with no input", (): void => {
    const game = groundActive(555);
    const before: number = countCells(game.board);
    game.update(600);
    expect(countCells(game.board)).toBe(before + 4);
  });

  it("a mid-delay successful move postpones locking", (): void => {
    const game = groundActive(777);
    const before: number = countCells(game.board);
    game.update(250);
    expect(game.moveLeft() || game.moveRight()).toBe(true);
    game.update(250);
    expect(countCells(game.board)).toBe(before);
  });

  it("move resets are capped at 15 (20-move loop then update(400) locks)", (): void => {
    const game = groundActive(31337);
    const before: number = countCells(game.board);
    for (let i: number = 0; i < 20; i++) {
      if (i % 2 === 0) {
        game.moveLeft();
      } else {
        game.moveRight();
      }
      game.update(30);
    }
    game.update(400);
    expect(countCells(game.board)).toBe(before + 4);
  });
});

describe("pause and start", (): void => {
  it("pause freezes time and input, resume restores", (): void => {
    const game = groundActive(2024);
    const before: number = countCells(game.board);
    game.pause();
    expect(game.state).toBe("paused");
    game.update(600);
    expect(countCells(game.board)).toBe(before);
    expect(game.moveLeft()).toBe(false);
    game.resume();
    expect(game.state).toBe("playing");
    game.update(600);
    expect(countCells(game.board)).toBe(before + 4);
  });

  it("start resets progress", (): void => {
    const game = createGame(8);
    game.hardDrop();
    game.hold();
    game.start();
    expect(game.state).toBe("playing");
    expect(game.score).toBe(0);
    expect(game.lines).toBe(0);
    expect(game.level).toBe(1);
    expect(game.held).toBeNull();
    expect(game.canHold).toBe(true);
    expect(countCells(game.board)).toBe(0);
    expect(game.active).not.toBeNull();
    expect(game.next).toHaveLength(5);
  });
});

describe("gravity curve levels", (): void => {
  it("advances level 1 to 2 when lines go 9 to 10 via update", (): void => {
    const game = createGame(7);
    game.lines = 9;
    const bottom: number = game.board.length - 1;
    for (let x: number = 0; x < COLS; x++) {
      game.board[bottom][x] = 1;
    }
    let guard: number = 0;
    while (game.softDrop() && guard < 100) {
      guard++;
    }
    game.update(600);
    expect(game.lines).toBe(10);
    expect(game.level).toBe(2);
  });

  it("falls strictly faster at level 2 than level 1", (): void => {
    expect(gravityIntervalMsForLevel(2)).toBeLessThan(
      gravityIntervalMsForLevel(1),
    );
  });

  it("scores soft +1 and hard +2 per cell", (): void => {
    const softGame = createGame(42);
    const softBefore: number = softGame.score;
    expect(softGame.softDrop()).toBe(true);
    expect(softGame.score - softBefore).toBe(1);
    const hardGame = createGame(42);
    const hardBefore: number = hardGame.score;
    const cellsBefore: number = countCells(hardGame.board);
    const distance: number = hardGame.hardDrop();
    expect(distance).toBeGreaterThan(0);
    expect(hardGame.score - hardBefore).toBe(2 * distance);
    expect(countCells(hardGame.board)).toBe(cellsBefore + 4);
  });
});
