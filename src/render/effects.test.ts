import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGame } from "../core/game";
import { renderPlayfield } from "./canvas";
import {
  CLEAR_COLLAPSE_MS,
  CLEAR_FLASH_MS,
  LOCK_FLASH_MS,
  SHAKE_MS,
  SHAKE_PX,
  collapseFor,
  createEffects,
  flashAlphaFor,
  shakeOffsetFor,
} from "./effects";

/** Fill the last `count` board rows completely with locked cells. */
function fillBottomRows(game: ReturnType<typeof createGame>, count: number): void {
  const grid: number[][] = game.board;
  for (let r = 0; r < count; r++) {
    const row: number[] = grid[grid.length - 1 - r];
    for (let x = 0; x < row.length; x++) {
      row[x] = 1;
    }
  }
}

/** Minimal 2d context covering every method `renderPlayfield` calls. */
function makeFxCtx(): Record<string, unknown> {
  return {
    fillRect(): void {},
    strokeRect(): void {},
    save(): void {},
    restore(): void {},
    translate(): void {},
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    stroke(): void {},
    setTransform(): void {},
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  };
}

/** Fake canvas routing `getContext` to the minimal context. */
function makeFxCanvas(ctx: Record<string, unknown>): HTMLCanvasElement {
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext(): Record<string, unknown> {
      return ctx;
    },
  };
  return canvas as unknown as HTMLCanvasElement;
}

/** Empty 22x10 grid matching the default board geometry. */
function emptyGrid(): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < 22; y++) {
    grid.push(new Array<number>(10).fill(0));
  }
  return grid;
}

describe("flashAlphaFor", (): void => {
  it("starts at 1 and fades linearly to 0 at the duration", (): void => {
    expect(flashAlphaFor(0, CLEAR_FLASH_MS)).toBe(1);
    expect(flashAlphaFor(CLEAR_FLASH_MS / 2, CLEAR_FLASH_MS)).toBeCloseTo(0.5, 10);
    expect(flashAlphaFor(CLEAR_FLASH_MS, CLEAR_FLASH_MS)).toBe(0);
    expect(flashAlphaFor(CLEAR_FLASH_MS + 50, CLEAR_FLASH_MS)).toBe(0);
  });

  it("returns 0 for non-finite input", (): void => {
    expect(flashAlphaFor(Number.NaN, CLEAR_FLASH_MS)).toBe(0);
    expect(flashAlphaFor(10, Number.NaN)).toBe(0);
  });
});

describe("collapseFor", (): void => {
  it("runs 0 to 1 across CLEAR_COLLAPSE_MS and clamps after", (): void => {
    expect(collapseFor(0)).toBe(0);
    expect(collapseFor(CLEAR_COLLAPSE_MS / 2)).toBeCloseTo(0.5, 10);
    expect(collapseFor(CLEAR_COLLAPSE_MS)).toBe(1);
    expect(collapseFor(CLEAR_COLLAPSE_MS + 100)).toBe(1);
  });
});

describe("shakeOffsetFor", (): void => {
  it("rests at zero and peaks near SHAKE_PX with a decaying sine", (): void => {
    expect(shakeOffsetFor(0)).toEqual({ dx: 0, dy: 0 });
    expect(shakeOffsetFor(SHAKE_MS)).toEqual({ dx: 0, dy: 0 });
    expect(shakeOffsetFor(SHAKE_MS + 40)).toEqual({ dx: 0, dy: 0 });
    const eighth = shakeOffsetFor(SHAKE_MS / 8);
    expect(eighth.dx).toBeCloseTo(SHAKE_PX * (7 / 8), 10);
    expect(Math.abs(shakeOffsetFor(SHAKE_MS / 4).dx)).toBeLessThanOrEqual(
      SHAKE_PX,
    );
  });
});

describe("Effects line-clear flash and collapse", (): void => {
  it("flashes white ~100ms then collapses by ~200ms, idle by 300ms", (): void => {
    const fx = createEffects();
    fx.notifyClear(1, [21], false, 1000);
    const atLock = fx.snapshot(1000);
    expect(atLock.clear.active).toBe(true);
    expect(atLock.clear.flashAlpha).toBe(1);
    expect(atLock.clear.collapse).toBe(0);
    expect(atLock.active).toBe(true);
    expect(fx.snapshot(1050).clear.flashAlpha).toBeCloseTo(0.5, 10);
    const afterFlash = fx.snapshot(1100);
    expect(afterFlash.clear.flashAlpha).toBe(0);
    expect(afterFlash.clear.active).toBe(true);
    expect(afterFlash.clear.collapse).toBeCloseTo(0.5, 10);
    const done = fx.snapshot(1200);
    expect(done.clear.active).toBe(false);
    expect(done.clear.collapse).toBe(1);
    const settled = fx.snapshot(1300);
    expect(settled.active).toBe(false);
    expect(fx.isActive(1300)).toBe(false);
  });

  it("does not shake on a single non-T-spin clear", (): void => {
    const fx = createEffects();
    fx.notifyClear(1, [21], false, 1000);
    expect(fx.snapshot(1010).shakeActive).toBe(false);
    expect(fx.snapshot(1010).shakeDx).toBe(0);
  });
});

describe("Effects shake gating", (): void => {
  it("shakes on Tetris and settles within SHAKE_MS", (): void => {
    const fx = createEffects();
    fx.notifyClear(4, [18, 19, 20, 21], false, 2000);
    expect(fx.snapshot(2000).shakeActive).toBe(true);
    expect(fx.snapshot(2020).shakeDx).not.toBe(0);
    expect(Math.abs(fx.snapshot(2020).shakeDx)).toBeLessThanOrEqual(SHAKE_PX);
    const done = fx.snapshot(2000 + SHAKE_MS);
    expect(done.shakeActive).toBe(false);
    expect(done.shakeDx).toBe(0);
    expect(done.shakeDy).toBe(0);
  });

  it("shakes on a T-spin clear even below four lines", (): void => {
    const fx = createEffects();
    fx.notifyClear(2, [20, 21], true, 3000);
    expect(fx.snapshot(3000).shakeActive).toBe(true);
    expect(fx.isActive(3000)).toBe(true);
  });
});

describe("Effects lock flash", (): void => {
  it("flashes stamped cells briefly then goes idle", (): void => {
    const fx = createEffects();
    fx.notifyLock(
      [
        [3, 20],
        [4, 20],
      ],
      4000,
    );
    const atLock = fx.snapshot(4000);
    expect(atLock.lock.active).toBe(true);
    expect(atLock.lock.flashAlpha).toBe(1);
    expect(atLock.active).toBe(true);
    expect(fx.snapshot(4060).lock.flashAlpha).toBeCloseTo(0.5, 10);
    const done = fx.snapshot(4000 + LOCK_FLASH_MS);
    expect(done.lock.active).toBe(false);
    expect(done.lock.flashAlpha).toBe(0);
    expect(fx.isActive(4000 + LOCK_FLASH_MS)).toBe(false);
  });

  it("clear() drops every pending overlay", (): void => {
    const fx = createEffects();
    fx.notifyClear(4, [18, 19, 20, 21], false, 5000);
    fx.notifyLock([[3, 20]], 5000);
    expect(fx.isActive(5000)).toBe(true);
    fx.clear();
    const idle = fx.snapshot(5000);
    expect(idle.active).toBe(false);
    expect(idle.clear.rows).toEqual([]);
    expect(idle.lock.cells).toEqual([]);
    expect(fx.isActive(5000)).toBe(false);
  });

  it("treats non-finite timestamps as idle", (): void => {
    const fx = createEffects();
    fx.notifyClear(4, [21], false, 6000);
    expect(fx.snapshot(Number.NaN).active).toBe(false);
    expect(fx.isActive(Number.NaN)).toBe(false);
  });
});

describe("effects renderer-only quarantine", (): void => {
  it("mentions shake and flash but never value-imports game logic", (): void => {
    const source: string = readFileSync(
      resolve("src/render/effects.ts"),
      "utf8",
    );
    expect(source).toMatch(/shake/);
    expect(source).toMatch(/flash/);
    expect(source).not.toMatch(
      /from\s+["']\.\.\/core\/(game|board|bag|scoring)["']/,
    );
  });
});

describe("game lock events drive juice without blocking rules", (): void => {
  it("respawns instantly on a single clear with input live during the flash", (): void => {
    const game = createGame(0);
    fillBottomRows(game, 1);
    const bottom: number = game.board.length - 1;
    game.hardDrop();
    expect(game.active).not.toBeNull();
    expect(game.lockSeq).toBe(1);
    const event = game.lastLockEvent;
    expect(event).not.toBeNull();
    expect(event?.count).toBe(1);
    expect(event?.rows).toEqual([bottom]);
    expect(event?.cells.length).toBeGreaterThan(0);
    const fx = createEffects();
    const t0: number = 5000;
    fx.notifyClear(event?.count ?? 0, event?.rows ?? [], event?.tSpin ?? false, t0);
    fx.notifyLock(event?.cells ?? [], t0);
    expect(fx.isActive(t0)).toBe(true);
    const before: number = game.active?.x ?? -1;
    const moved: boolean = game.moveLeft() || game.moveRight();
    expect(moved).toBe(true);
    expect(game.active?.x).not.toBe(before);
    expect(fx.isActive(t0 + 100)).toBe(true);
  });

  it("records a Tetris with four rows that shakes the playfield", (): void => {
    const game = createGame(0);
    const rows: number = game.board.length;
    fillBottomRows(game, 4);
    game.hardDrop();
    expect(game.active).not.toBeNull();
    expect(game.lockSeq).toBe(1);
    expect(game.lastLockEvent?.count).toBe(4);
    expect(game.lastLockEvent?.rows).toEqual([
      rows - 4,
      rows - 3,
      rows - 2,
      rows - 1,
    ]);
    const fx = createEffects();
    fx.notifyClear(4, game.lastLockEvent?.rows ?? [], false, 7000);
    expect(fx.snapshot(7000).shakeActive).toBe(true);
  });

  it("bumps lockSeq per lock and resets tracking state on start", (): void => {
    const game = createGame(0);
    fillBottomRows(game, 1);
    game.hardDrop();
    expect(game.lockSeq).toBe(1);
    expect(game.lastLockEvent?.seq).toBe(1);
    game.hardDrop();
    expect(game.lockSeq).toBe(2);
    expect(game.lastLockEvent?.seq).toBe(2);
    game.start(0);
    expect(game.lockSeq).toBe(0);
    expect(game.lastLockEvent).toBeNull();
  });
});

describe("renderPlayfield with juice", (): void => {
  it("paints flash, collapse, and shake overlays without throwing", (): void => {
    const fx = createEffects();
    fx.notifyClear(4, [18, 19, 20, 21], false, 8000);
    fx.notifyLock(
      [
        [3, 20],
        [4, 20],
      ],
      8000,
    );
    const snapshot = fx.snapshot(8020);
    expect(snapshot.active).toBe(true);
    const ctx: Record<string, unknown> = makeFxCtx();
    const canvas: HTMLCanvasElement = makeFxCanvas(ctx);
    expect((): void => {
      renderPlayfield(canvas, { board: emptyGrid(), active: null }, snapshot);
    }).not.toThrow();
    expect((): void => {
      renderPlayfield(canvas, { board: emptyGrid(), active: null });
    }).not.toThrow();
  });
});
