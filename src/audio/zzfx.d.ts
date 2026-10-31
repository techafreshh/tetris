/**
 * Minimal typings for the `zzfx` runtime dependency (the package ships no
 * `.d.ts`). Only the surface used by `src/audio/sfx.ts` is declared.
 */
declare module "zzfx" {
  /** Play a sound from zzfx parameters (fire-and-forget sample synth). */
  export function zzfx(...parameters: number[]): unknown;
  /** Shared zzfx engine state; `audioContext` is rebound after unlock. */
  export const ZZFX: {
    /** Master volume scale. */
    volume: number;
    /** Shared context; rebound to the gesture-created context on unlock. */
    audioContext: AudioContext;
    /** Play a sound from zzfx parameters. */
    play(...parameters: number[]): unknown;
    /** Render a sound to a mono sample array (offline, no playback). */
    buildSamples(...parameters: number[]): Float32Array;
  };
}
