// Procedural retro SFX via the `zzfx` synth (zero audio assets).
// Import-safe under node: no top-level AudioContext and only a cached
// dynamic `import("zzfx")` (the shipped bundles build a context at module
// evaluation, which would throw pre-gesture and break vitest). All sound is
// fire-and-forget; game logic never awaits it and never branches on it.

/** Sounds in the issue contract: actions plus result fanfare. */
export type SfxName =
  | "move"
  | "rotate"
  | "lock"
  | "clear"
  | "tetris"
  | "harddrop"
  | "levelup"
  | "gameover";

/**
 * Starter zzfx parameter tunings per sound (volume, randomness, frequency,
 * attack, sustain, release, shape, ..., slide/pitch-jump tail). Distinct
 * pitch and duration per action; not golden fixtures.
 */
export const SFX_PARAMS: Record<SfxName, number[]> = {
  /** Short mid square blip for lateral shifts. */
  move: [0.2, 0, 440, 0, 0.05, 0.06, 2],
  /** Higher blip for rotations. */
  rotate: [0.2, 0, 660, 0, 0.05, 0.06, 2],
  /** Low thud for natural locks. */
  lock: [0.35, 0, 140, 0, 0.06, 0.09, 1],
  /** Rising chime for 1-3 line clears. */
  clear: [0.3, 0, 520, 0, 0.12, 0.18, 0, 1, 0.35],
  /** Larger rise plus pitch jump for Tetris clears. */
  tetris: [0.35, 0, 380, 0, 0.22, 0.3, 0, 1, 0.5, 0, 320, 0.12],
  /** Low thunk for hard-drops (covers the lock itself). */
  harddrop: [0.4, 0, 95, 0, 0.06, 0.12, 3],
  /** Two-tone rise for level-ups. */
  levelup: [0.3, 0, 620, 0, 0.09, 0.12, 0, 1, 0.45, 0, 420, 0.09],
  /** Long descending tone for game-over. */
  gameover: [0.35, 0, 420, 0, 0.4, 0.6, 1, 1, -0.6],
};

/** Session mute flag (page lifetime; never persisted). */
let muted: boolean = false;

/** Gesture-created context, or null before the first keypress. */
let audioCtx: AudioContext | null = null;

/** Cached `zzfx` module import; resolves to null when unavailable. */
let zzfxPromise: Promise<typeof import("zzfx") | null> | null = null;

/** True while muted for the session. */
export function isMuted(): boolean {
  return muted;
}

/** Set the session mute flag (never touches audio state or the DOM). */
export function setMuted(next: boolean): void {
  muted = next;
}

/** The gesture-created context, or null before the first keypress. */
export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

/** Lazily import `zzfx` once; failures resolve to null, never reject. */
function ensureZzfx(): Promise<typeof import("zzfx") | null> {
  if (zzfxPromise !== null) {
    return zzfxPromise;
  }
  zzfxPromise = import("zzfx").then(
    (mod: typeof import("zzfx")): typeof import("zzfx") | null => mod,
    (): null => null,
  );
  return zzfxPromise;
}

/**
 * Create (once) and resume the shared AudioContext inside the caller's
 * keydown gesture, warm the cached `zzfx` import, and rebind the engine to
 * the gesture context. No-op without `window`/`AudioContext`; never throws.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const ctor: unknown =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: unknown })
        .webkitAudioContext;
    if (typeof ctor !== "function") {
      return;
    }
    if (audioCtx === null) {
      try {
        audioCtx = new (ctor as typeof AudioContext)();
      } catch {
        return;
      }
      try {
        (
          window as unknown as { __audioContext?: AudioContext | null }
        ).__audioContext = audioCtx;
      } catch {
        // Debug seam only; a failed mirror must not break unlocking.
      }
    }
    try {
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch((): void => {
          // Rapid-key resume races stay silent by design.
        });
      }
    } catch {
      // A wedged context must never break input.
    }
    void ensureZzfx().then((mod: typeof import("zzfx") | null): void => {
      if (mod === null || audioCtx === null) {
        return;
      }
      try {
        mod.ZZFX.audioContext = audioCtx;
      } catch {
        // Rebinding is best-effort; the default context still plays.
      }
    });
  } catch {
    // Audio must never gate game logic.
  }
}

/**
 * Play one named sound without blocking input: resumes a suspended context
 * and delegates to `zzfx` on a fire-and-forget microtask. Silent when muted,
 * unknown, or unavailable; never throws and never returns a promise.
 */
export function playSfx(name: SfxName): void {
  if (muted) {
    return;
  }
  const params: number[] | undefined = SFX_PARAMS[name];
  if (params === undefined) {
    return;
  }
  try {
    if (audioCtx !== null && audioCtx.state === "suspended") {
      audioCtx.resume().catch((): void => {
        // Playback-time resume races stay silent by design.
      });
    }
  } catch {
    // A wedged context must never break input.
  }
  void ensureZzfx().then((mod: typeof import("zzfx") | null): void => {
    if (mod === null || muted) {
      return;
    }
    try {
      mod.zzfx(...params);
    } catch {
      // Playback failures stay silent by design.
    }
  });
}
