// Behavior tests for the procedural zzfx SFX module (mocked synth).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockZzfx, mockZZFX } = vi.hoisted(() => ({
  mockZzfx: vi.fn(),
  mockZZFX: {
    volume: 0.3,
    audioContext: null,
    play: vi.fn(),
    buildSamples: vi.fn(),
  },
}));

vi.mock("zzfx", () => ({
  zzfx: mockZzfx,
  ZZFX: mockZZFX,
}));

import {
  SFX_PARAMS,
  getAudioContext,
  isMuted,
  playSfx,
  setMuted,
  unlockAudio,
  type SfxName,
} from "./sfx";

const ALL_SOUNDS: readonly SfxName[] = [
  "move",
  "rotate",
  "lock",
  "clear",
  "tetris",
  "harddrop",
  "levelup",
  "gameover",
];

/** Let the fire-and-forget dynamic-import chain settle. */
async function flushAudio(): Promise<void> {
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 10);
  });
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 10);
  });
}

beforeEach((): void => {
  setMuted(false);
  mockZzfx.mockClear();
  mockZZFX.play.mockClear();
  mockZZFX.buildSamples.mockClear();
});

describe("SFX_PARAMS", (): void => {
  it("covers all eight contract sounds with non-empty arrays", (): void => {
    expect(Object.keys(SFX_PARAMS).sort()).toEqual([...ALL_SOUNDS].sort());
    for (const name of ALL_SOUNDS) {
      expect(SFX_PARAMS[name].length).toBeGreaterThan(0);
    }
  });

  it("uses mutually distinct tunings per sound", (): void => {
    const seen = new Set(
      ALL_SOUNDS.map((name: SfxName): string => JSON.stringify(SFX_PARAMS[name])),
    );
    expect(seen.size).toBe(ALL_SOUNDS.length);
  });
});

describe("mute", (): void => {
  it("round-trips through setMuted/isMuted", (): void => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it("suppresses playback while muted", async (): Promise<void> => {
    setMuted(true);
    playSfx("move");
    await flushAudio();
    expect(mockZzfx).not.toHaveBeenCalled();
  });

  it("plays the move tuning unmuted", async (): Promise<void> => {
    playSfx("move");
    await flushAudio();
    expect(mockZzfx).toHaveBeenCalledWith(...SFX_PARAMS.move);
  });
});

describe("node safety", (): void => {
  it("unlockAudio and playSfx never throw without AudioContext", (): void => {
    expect((): void => unlockAudio()).not.toThrow();
    expect((): void => playSfx("lock")).not.toThrow();
    expect(getAudioContext()).toBeNull();
  });
});
