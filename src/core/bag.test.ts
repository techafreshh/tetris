import { describe, expect, it } from "vitest";
import { createBag } from "./bag";
import type { PieceKind } from "./bag";

const PIECE_KINDS: readonly PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];

describe("7-bag distribution", (): void => {
  it("700 draws contain exactly 100 of each piece with 7 distinct per chunk", (): void => {
    const bag = createBag(1);
    const draws: PieceKind[] = [];
    for (let i: number = 0; i < 700; i++) {
      draws.push(bag.next());
    }

    const counts: Record<PieceKind, number> = {
      I: 0,
      O: 0,
      T: 0,
      S: 0,
      Z: 0,
      J: 0,
      L: 0,
    };
    for (const piece of draws) {
      counts[piece] += 1;
    }
    for (const kind of PIECE_KINDS) {
      expect(counts[kind]).toBe(100);
    }

    for (let chunk: number = 0; chunk < 100; chunk++) {
      const group: PieceKind[] = draws.slice(chunk * 7, chunk * 7 + 7);
      expect(new Set(group).size).toBe(7);
    }
  });
});

describe("seeded determinism", (): void => {
  it("two bags with seed 1234 draw identical 14-piece sequences", (): void => {
    const a = createBag(1234);
    const b = createBag(1234);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i: number = 0; i < 14; i++) {
      seqA.push(a.next());
      seqB.push(b.next());
    }
    expect(seqA.join("")).toBe(seqB.join(""));
  });

  it("differently seeded bags do not share the first permutation", (): void => {
    const a = createBag(1);
    const b = createBag(2);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i: number = 0; i < 7; i++) {
      seqA.push(a.next());
      seqB.push(b.next());
    }
    expect(seqA.join("")).not.toBe(seqB.join(""));
  });
});
