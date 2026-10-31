import { describe, expect, it } from "vitest";
import {
  hardDropScore,
  scoreLineClear,
  softDropScore,
} from "./scoring";

describe("scoreLineClear base table", (): void => {
  it("Single at level 2 scores 200", (): void => {
    expect(scoreLineClear(1, 2)).toBe(200);
  });

  it("Tetris at level 3 scores 2400", (): void => {
    expect(scoreLineClear(4, 3)).toBe(2400);
  });
});

describe("scoreLineClear back-to-back", (): void => {
  it("B2B Tetris at level 1 scores 1200", (): void => {
    expect(scoreLineClear(4, 1, { backToBack: true })).toBe(1200);
  });

  it("B2B Single is unchanged", (): void => {
    expect(scoreLineClear(1, 1, { backToBack: true })).toBe(
      scoreLineClear(1, 1),
    );
  });
});

describe("scoreLineClear combo", (): void => {
  it("combo 0 adds no bonus", (): void => {
    expect(scoreLineClear(1, 2, { combo: 0 })).toBe(200);
  });

  it("combo steps add exactly 50 * combo * level", (): void => {
    expect(scoreLineClear(1, 2, { combo: 1 })).toBe(200 + 50 * 1 * 2);
    expect(scoreLineClear(1, 2, { combo: 2 })).toBe(200 + 50 * 2 * 2);
  });
});

describe("scoreLineClear T-spin", (): void => {
  it("T-spin Double outscores a plain Double at the same level", (): void => {
    const plain: number = scoreLineClear(2, 1);
    const tSpin: number = scoreLineClear(2, 1, { tSpin: true });
    expect(tSpin).toBe(1200);
    expect(tSpin).toBeGreaterThan(plain);
  });
});

describe("drop scores", (): void => {
  it("soft drop of 5 cells scores 5", (): void => {
    expect(softDropScore(5)).toBe(5);
  });

  it("hard drop of 5 cells scores 10", (): void => {
    expect(hardDropScore(5)).toBe(10);
  });
});
