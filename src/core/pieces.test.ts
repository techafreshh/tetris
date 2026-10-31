import { describe, expect, it } from "vitest";
import { PIECES, SRS_KICKS_I, SRS_KICKS_JLSTZ } from "./pieces";
import type { PieceKind, SrsKickKey } from "./pieces";

const PIECE_KINDS: readonly PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];

const KICK_KEYS: readonly SrsKickKey[] = [
  "0>R",
  "R>0",
  "R>2",
  "2>R",
  "2>L",
  "L>2",
  "L>0",
  "0>L",
];

describe("PIECES keys", (): void => {
  it("defines all seven tetrominoes", (): void => {
    for (const kind of PIECE_KINDS) {
      expect(PIECES[kind]).toBeDefined();
      expect(PIECES[kind].kind).toBe(kind);
    }
  });
});

describe("PIECES rotation states", (): void => {
  it("has 4 states of 4 cells for every piece", (): void => {
    for (const kind of PIECE_KINDS) {
      expect(PIECES[kind].states).toHaveLength(4);
      for (const state of PIECES[kind].states) {
        expect(state).toHaveLength(4);
      }
    }
  });

  it("I-piece has 4 cells in each of 4 rotation states", (): void => {
    expect(PIECES["I"].states).toHaveLength(4);
    for (const state of PIECES["I"].states) {
      expect(state).toHaveLength(4);
    }
  });

  it("O-piece rotation states are identical", (): void => {
    const [spawn, ...rest] = PIECES["O"].states;
    for (const state of rest) {
      expect(state).toEqual(spawn);
    }
  });
});

describe("SRS kick tables", (): void => {
  it("both tables have 8 keys of 5 offsets starting at [0, 0]", (): void => {
    for (const table of [SRS_KICKS_JLSTZ, SRS_KICKS_I]) {
      expect(Object.keys(table)).toHaveLength(8);
      for (const key of KICK_KEYS) {
        expect(table[key]).toHaveLength(5);
        expect(table[key][0]).toEqual([0, 0]);
      }
    }
  });

  it("JLSTZ 0>R matches the verbatim spec offsets", (): void => {
    expect(SRS_KICKS_JLSTZ["0>R"]).toEqual([
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2],
    ]);
  });

  it("I 0>R matches the verbatim spec offsets", (): void => {
    expect(SRS_KICKS_I["0>R"]).toEqual([
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, -1],
      [1, 2],
    ]);
  });
});
