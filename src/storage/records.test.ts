// Records store tests: defaults, max/accumulate, corrupt input, throwing storage.
// Uses a structural window.localStorage stub (no DOM library).
import { beforeEach, describe, expect, it } from "vitest";
import {
  BEST_PPS_KEY,
  HIGH_SCORE_KEY,
  TOTAL_LINES_KEY,
  loadRecords,
  recordRun,
  resetMemoryRecords,
} from "./records";

function clearWindow(): void {
  resetMemoryRecords();
  const g = globalThis as unknown as { window?: unknown };
  delete g.window;
}

function stubStorage(
  values: Record<string, string | null>,
  opts: { throwOnSet?: boolean } = {},
): void {
  resetMemoryRecords();
  const store = {
    getItem(key: string): string | null {
      if (key in values) {
        return values[key];
      }
      return null;
    },
    setItem(_key: string, _value: string): void {
      if (opts.throwOnSet === true) {
        throw new Error("private browsing");
      }
    },
  };
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: store,
  };
}

beforeEach((): void => {
  clearWindow();
});

describe("loadRecords", (): void => {
  it("defaults to zeros with no storage", (): void => {
    expect(loadRecords()).toEqual({ highScore: 0, totalLines: 0, bestPps: 0 });
  });

  it("coerces corrupt stored strings to zero", (): void => {
    stubStorage({
      [HIGH_SCORE_KEY]: "abc",
      [TOTAL_LINES_KEY]: "-25",
      [BEST_PPS_KEY]: "Infinity",
    });
    expect(loadRecords()).toEqual({ highScore: 0, totalLines: 0, bestPps: 0 });
  });

  it("coerces negative stored integers to zero", (): void => {
    stubStorage({
      [HIGH_SCORE_KEY]: "-5",
      [TOTAL_LINES_KEY]: "-1",
      [BEST_PPS_KEY]: "-2.5",
    });
    expect(loadRecords()).toEqual({ highScore: 0, totalLines: 0, bestPps: 0 });
  });
});

describe("recordRun", (): void => {
  it("keeps the max high score", (): void => {
    const first = recordRun({ score: 100, lines: 1, pps: 1 });
    expect(first.records.highScore).toBe(100);
    expect(first.isNewBest).toBe(true);
    const second = recordRun({ score: 50, lines: 1, pps: 2 });
    expect(second.records.highScore).toBe(100);
    expect(second.isNewBest).toBe(false);
    const third = recordRun({ score: 200, lines: 0, pps: 0 });
    expect(third.records.highScore).toBe(200);
    expect(third.isNewBest).toBe(true);
  });

  it("never reports NEW BEST for a zero-score run", (): void => {
    const result = recordRun({ score: 0, lines: 0, pps: 0 });
    expect(result.isNewBest).toBe(false);
    expect(result.records.highScore).toBe(0);
  });

  it("accumulates total lines across two runs", (): void => {
    recordRun({ score: 10, lines: 3, pps: 0.5 });
    const second = recordRun({ score: 20, lines: 4, pps: 0.5 });
    expect(second.records.totalLines).toBe(7);
  });

  it("keeps the max best PPS", (): void => {
    recordRun({ score: 10, lines: 1, pps: 1.25 });
    const lower = recordRun({ score: 10, lines: 1, pps: 0.5 });
    expect(lower.records.bestPps).toBeCloseTo(1.25, 10);
    const higher = recordRun({ score: 10, lines: 1, pps: 3.5 });
    expect(higher.records.bestPps).toBeCloseTo(3.5, 10);
  });

  it("falls back to memory when setItem throws, without throwing", (): void => {
    stubStorage(
      { [HIGH_SCORE_KEY]: null, [TOTAL_LINES_KEY]: null, [BEST_PPS_KEY]: null },
      { throwOnSet: true },
    );
    let result: ReturnType<typeof recordRun> | null = null;
    expect((): void => {
      result = recordRun({ score: 500, lines: 5, pps: 2.5 });
    }).not.toThrow();
    expect((result as unknown as ReturnType<typeof recordRun>).records.highScore).toBe(500);
    expect((result as unknown as ReturnType<typeof recordRun>).records.totalLines).toBe(5);
    expect((result as unknown as ReturnType<typeof recordRun>).isNewBest).toBe(true);
    const reloaded = loadRecords();
    expect(reloaded.highScore).toBe(500);
    expect(reloaded.totalLines).toBe(5);
  });
});
