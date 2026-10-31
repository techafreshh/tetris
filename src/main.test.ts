import { describe, expect, it } from "vitest";
import {
  PIECE_START_X,
  STEP_MS,
  computeRunPps,
  diffResults,
  gameOverSummaryText,
  shouldPreventDefault,
  stepAccumulator,
  stepPieceX,
  type ResultSnapshot,
} from "./main";

describe("stepAccumulator", (): void => {
  it("slices 33.34ms into exactly two fixed steps with remainder below STEP_MS", (): void => {
    const result = stepAccumulator(33.34);
    expect(result.steps).toBe(2);
    expect(result.remainder).toBeLessThan(STEP_MS);
    expect(result.remainder).toBeGreaterThanOrEqual(0);
  });

  it("yields zero steps for sub-step input", (): void => {
    const result = stepAccumulator(STEP_MS / 2);
    expect(result.steps).toBe(0);
    expect(result.remainder).toBeCloseTo(STEP_MS / 2, 10);
  });
});

describe("shouldPreventDefault", (): void => {
  it("blocks all four arrows and every Space form", (): void => {
    expect(shouldPreventDefault("ArrowLeft", "ArrowLeft")).toBe(true);
    expect(shouldPreventDefault("ArrowRight", "ArrowRight")).toBe(true);
    expect(shouldPreventDefault("ArrowUp", "ArrowUp")).toBe(true);
    expect(shouldPreventDefault("ArrowDown", "ArrowDown")).toBe(true);
    expect(shouldPreventDefault(" ", "Space")).toBe(true);
    expect(shouldPreventDefault("Spacebar", "Space")).toBe(true);
    expect(shouldPreventDefault("x", "Space")).toBe(true);
  });

  it("leaves ordinary keys alone", (): void => {
    expect(shouldPreventDefault("a", "KeyA")).toBe(false);
    expect(shouldPreventDefault("Enter", "Enter")).toBe(false);
  });
});

describe("gameOverSummaryText", (): void => {
  it("contains LEVEL, PPS, COMBO and the numeric score", (): void => {
    const text: string = gameOverSummaryText(500, 12, 2, 1.5, 3, false);
    expect(text).toContain("LEVEL");
    expect(text).toContain("PPS");
    expect(text).toContain("COMBO");
    expect(text).toContain("500");
    expect(text).not.toContain("NEW BEST");
  });

  it("appends NEW BEST only when beaten", (): void => {
    const best: string = gameOverSummaryText(500, 12, 2, 1.5, 3, true);
    expect(best).toContain("NEW BEST");
    expect(best).toContain("500");
    const plain: string = gameOverSummaryText(0, 0, 1, 0, 0, false);
    expect(plain).not.toContain("NEW BEST");
  });

  it("formats PPS with two decimals", (): void => {
    const text: string = gameOverSummaryText(10, 2, 1, 1.5, 0, false);
    expect(text).toContain("PPS 1.50");
  });
});

describe("computeRunPps", (): void => {
  it("guards missing, non-finite, or sub-50ms elapsed to zero", (): void => {
    expect(computeRunPps(10, 0)).toBe(0);
    expect(computeRunPps(10, 0.04)).toBe(0);
    expect(computeRunPps(10, Number.NaN)).toBe(0);
    expect(computeRunPps(Number.NaN, 2)).toBe(0);
  });

  it("divides floored pieces by elapsed seconds", (): void => {
    expect(computeRunPps(10, 2)).toBeCloseTo(5, 10);
  });
});
describe("STEP_MS", (): void => {
  it("is exactly one 1000/60ms slice", (): void => {
    expect(STEP_MS).toBe(1000 / 60);
  });
});

describe("stepPieceX", (): void => {
  it("moves left and right by one column", (): void => {
    expect(stepPieceX(5, "left-press")).toBe(4);
    expect(stepPieceX(5, "left-held")).toBe(4);
    expect(stepPieceX(5, "right-press")).toBe(6);
    expect(stepPieceX(5, "right-held")).toBe(6);
  });

  it("clamps at the playfield walls", (): void => {
    expect(stepPieceX(0, "left-press")).toBe(0);
    expect(stepPieceX(0, "left-held")).toBe(0);
    expect(stepPieceX(9, "right-press")).toBe(9);
    expect(stepPieceX(9, "right-held")).toBe(9);
  });

  it("leaves the column unchanged for non-movement intents", (): void => {
    expect(stepPieceX(5, "rotate-cw")).toBe(5);
    expect(stepPieceX(5, "rotate-ccw")).toBe(5);
    expect(stepPieceX(5, "hard-drop")).toBe(5);
    expect(stepPieceX(5, "hold")).toBe(5);
    expect(stepPieceX(5, "pause")).toBe(5);
    expect(stepPieceX(5, "restart")).toBe(5);
    expect(stepPieceX(5, "mute")).toBe(5);
  });

  it("starts central with leftward sweep room", (): void => {
    expect(PIECE_START_X).toBe(5);
    let x: number = PIECE_START_X;
    for (let i = 0; i < 4; i++) {
      x = stepPieceX(x, "left-held");
    }
    expect(x).toBe(1);
  });
});

describe("diffResults", (): void => {
  function snap(overrides: Partial<ResultSnapshot> = {}): ResultSnapshot {
    return {
      lines: 0,
      level: 1,
      state: "playing",
      locks: 0,
      ...overrides,
    };
  }

  it("returns lock on a locks-only advance", (): void => {
    expect(diffResults(snap(), snap({ locks: 1 }))).toEqual(["lock"]);
  });

  it("returns clear on 1-3 lines", (): void => {
    expect(diffResults(snap(), snap({ lines: 2, locks: 1 }))).toEqual([
      "clear",
    ]);
  });

  it("returns tetris on 4 lines", (): void => {
    expect(diffResults(snap(), snap({ lines: 4, locks: 1 }))).toEqual([
      "tetris",
    ]);
  });

  it("appends levelup when the level rises with a clear", (): void => {
    expect(
      diffResults(snap({ lines: 9 }), snap({ lines: 10, level: 2, locks: 1 })),
    ).toEqual(["clear", "levelup"]);
  });

  it("includes gameover on the terminal transition instead of lock", (): void => {
    expect(
      diffResults(snap(), snap({ state: "gameover", locks: 1 })),
    ).toEqual(["gameover"]);
  });

  it("emits nothing on a restart-style reset", (): void => {
    expect(
      diffResults(
        snap({ lines: 5, level: 2, locks: 3 }),
        snap({ locks: 0 }),
      ),
    ).toEqual([]);
  });

  it("suppresses lock under suppressLock", (): void => {
    expect(
      diffResults(snap(), snap({ locks: 1 }), { suppressLock: true }),
    ).toEqual([]);
  });
});
