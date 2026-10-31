// Seeded 7-bag randomizer: fair, replayable piece source for core.
// Pure logic module — no DOM, no imports, no timing APIs.

/** Tetromino kind keyed by piece letter. */
export type PieceKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** Minimal bag handle: draw the next piece letter. */
export interface Bag {
  /** Draw the next piece letter from the bag stream. */
  next(): PieceKind;
}

/** Canonical 7-letter set backing every bag refill. */
const BAG_PIECES: readonly PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];

/** Seeded PRNG (mulberry32): returns a function yielding [0, 1). */
function mulberry32(seed: number): () => number {
  let state: number = seed >>> 0;
  return function (): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t: number = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle a copy of the 7-letter set with Fisher-Yates using rand. */
function shuffledBag(rand: () => number): PieceKind[] {
  const fresh: PieceKind[] = [...BAG_PIECES];
  for (let i: number = fresh.length - 1; i > 0; i--) {
    const j: number = Math.floor(rand() * (i + 1));
    const tmp: PieceKind = fresh[i];
    fresh[i] = fresh[j];
    fresh[j] = tmp;
  }
  return fresh;
}

/**
 * Create a seeded 7-bag yielding an infinite deterministic stream where
 * every consecutive group of 7 draws is a full permutation of the 7
 * tetrominoes. Identical seeds replay identical sequences.
 */
export function createBag(seed: number): Bag {
  const normalized: number = seed >>> 0;
  const rand: () => number = mulberry32(normalized);
  let queue: PieceKind[] = [];

  function next(): PieceKind {
    if (queue.length === 0) {
      queue = shuffledBag(rand);
    }
    return queue.shift() as PieceKind;
  }

  return { next };
}
