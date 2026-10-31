// Tetromino spawn states and SRS wall-kick tables (Guideline SRS).
// Pure data module — no DOM, no imports, no logic.
// Cell offsets are [x, y] in bounding-box coordinates (x right, y down,
// origin at the box top-left: 4x4 box for I, 3x3 for J/L/S/T/Z, 2x2 for O).
// Kick values are spec y-up (positive y = up); the sign flip to board
// y-down happens in the future rotation consumer.
// Keys covered: "I","O","T","S","Z","J","L".

/** Tetromino kind keyed by piece letter. */
export type PieceKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** A single cell offset as readonly [x, y]. */
export type CellOffset = readonly [number, number];

/** Static definition of one tetromino: color plus 4 rotation states of 4 cells. */
export interface PieceDefinition {
  /** Piece letter. */
  readonly kind: PieceKind;
  /** Guideline hex color. */
  readonly color: string;
  /** Four rotation states (0, R, 2, L); each state holds exactly 4 cells. */
  readonly states: readonly (readonly CellOffset[])[];
}

/** Seven tetromino definitions with spawn matrices and 4 rotation states each. */
export const PIECES: Record<PieceKind, PieceDefinition> = {
  "I": {
    kind: "I",
    color: "#00F0F0",
    states: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
  },
  "O": {
    kind: "O",
    color: "#F0F000",
    states: [
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
    ],
  },
  "T": {
    kind: "T",
    color: "#A000F0",
    states: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  "S": {
    kind: "S",
    color: "#00F000",
    states: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  "Z": {
    kind: "Z",
    color: "#F00000",
    states: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
  },
  "J": {
    kind: "J",
    color: "#0000F0",
    states: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
  },
  "L": {
    kind: "L",
    color: "#F0A000",
    states: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  },
};

/** SRS rotation-transition key using the spec's own 0/R/2/L state names. */
export type SrsKickKey =
  | "0>R"
  | "R>0"
  | "R>2"
  | "2>R"
  | "2>L"
  | "L>2"
  | "L>0"
  | "0>L";

/** SRS kick table: 8 transition keys, each with 5 [x, y] offsets (first is [0, 0]). */
export type SrsKickTable = Record<SrsKickKey, readonly CellOffset[]>;

/**
 * Guideline SRS wall kicks for J, L, S, T, Z.
 * Values are spec y-up verbatim (positive y = up). No SrsKickTable entry for O:
 * per spec the O piece does not kick.
 */
export const SRS_KICKS_JLSTZ: SrsKickTable = {
  "0>R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "R>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "R>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "L>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "L>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0>L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

/**
 * Guideline SRS wall kicks for I (Guideline SRS, not the Arika variant).
 * Values are spec y-up verbatim (positive y = up).
 */
export const SRS_KICKS_I: SrsKickTable = {
  "0>R": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "R>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "R>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>R": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>L": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "L>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "L>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0>L": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
