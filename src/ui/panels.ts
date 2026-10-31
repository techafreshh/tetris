// Side-panel DOM sync: HOLD slot, NEXT queue, SCORE/LINES/LEVEL stats.
// Dependency-free rendering helpers — they take plain data snapshots and
// never import game, input, or render logic, so they stay unit-testable.
import { PIECE_COLORS } from "../core/constants";
import type { PieceKind } from "../core/pieces";

/** Number of upcoming pieces shown in the NEXT queue. */
export const NEXT_COUNT: number = 5;

/** Plain snapshot synced into the side panels. */
export interface PanelData {
  /** Held piece letter, or null before the first hold. */
  readonly held: PieceKind | null;
  /** Upcoming pieces in display order (only the first 5 are shown). */
  readonly next: readonly PieceKind[];
  /** Total score. */
  readonly score: number;
  /** Total lines cleared. */
  readonly lines: number;
  /** Current level. */
  readonly level: number;
}

/** Signature of the last synced snapshot; skips redundant DOM writes. */
let lastSignature: string | null = null;

/**
 * Clear the syncPanels signature cache (tests and fresh boots).
 */
export function resetPanelsCache(): void {
  lastSignature = null;
}

/**
 * Build one queue/slot child for a piece: letter text plus data-kind.
 * Falls back to a minimal fake node when no document is available
 * (structural fake-DOM test harnesses have no ownerDocument).
 * @param kind Tetromino letter.
 * @param host Panel element the child will be appended to.
 * @returns A `.piece` element carrying the kind.
 */
function createPieceChild(kind: PieceKind, host: HTMLElement): HTMLElement {
  const owner: unknown = (host as unknown as { ownerDocument?: unknown })
    .ownerDocument;
  const doc: unknown =
    owner ??
    (typeof document !== "undefined"
      ? (globalThis as unknown as { document?: unknown }).document
      : undefined);
  let child: HTMLElement;
  if (
    doc !== undefined &&
    doc !== null &&
    typeof (doc as { createElement?: unknown }).createElement === "function"
  ) {
    child = (doc as Document).createElement("div") as HTMLElement;
  } else {
    child = {
      className: "",
      textContent: "",
      dataset: {},
      style: {},
    } as unknown as HTMLElement;
  }
  child.className = "piece";
  child.textContent = kind;
  child.dataset.kind = kind;
  child.style.color = PIECE_COLORS[kind];
  return child;
}

/**
 * Replace a host's children without assuming replaceChildren exists.
 * @param host Panel element to refill.
 * @param kids Child elements in display order.
 */
function replaceKids(host: HTMLElement, kids: readonly HTMLElement[]): void {
  const anyHost = host as unknown as {
    replaceChildren?: (...nodes: HTMLElement[]) => void;
    firstChild?: HTMLElement | null;
    removeChild?: (node: HTMLElement) => void;
    appendChild: (node: HTMLElement) => void;
  };
  if (typeof anyHost.replaceChildren === "function") {
    anyHost.replaceChildren(...kids);
    return;
  }
  if (typeof anyHost.removeChild === "function") {
    let first: HTMLElement | null | undefined = anyHost.firstChild;
    while (first !== null && first !== undefined) {
      anyHost.removeChild(first);
      first = anyHost.firstChild;
    }
  } else if (Array.isArray((host as unknown as { children?: unknown }).children)) {
    (host as unknown as { children: unknown[] }).children.length = 0;
  }
  for (const kid of kids) {
    anyHost.appendChild(kid);
  }
}

/**
 * Read the piece identity of a queue/slot child.
 * @param child Queue or slot child element.
 * @returns The data-kind letter, falling back to the letter text.
 */
function childKind(child: HTMLElement): string {
  const kind: unknown = (child as unknown as { dataset?: { kind?: unknown } })
    .dataset?.kind;
  if (typeof kind === "string" && kind.length > 0) {
    return kind;
  }
  return child.textContent ?? "";
}

/**
 * Sync the HOLD slot: zero children when empty, else one piece child.
 * Skips DOM writes when the slot already matches.
 * @param host The `#hold-slot` element (null-safe no-op).
 * @param held Held piece letter, or null for the empty slot.
 */
export function syncHold(host: HTMLElement | null, held: PieceKind | null): void {
  if (host === null) {
    return;
  }
  if (held === null) {
    if (host.children.length === 0) {
      return;
    }
    replaceKids(host, []);
    return;
  }
  if (host.children.length === 1) {
    const only = host.children[0] as unknown as HTMLElement;
    if (childKind(only) === held) {
      return;
    }
  }
  replaceKids(host, [createPieceChild(held, host)]);
}

/**
 * Sync the NEXT queue: exactly the first 5 upcoming pieces in order.
 * Skips DOM writes when the queue already matches.
 * @param host The `#next-queue` element (null-safe no-op).
 * @param next Upcoming pieces in display order.
 */
export function syncNext(
  host: HTMLElement | null,
  next: readonly PieceKind[],
): void {
  if (host === null) {
    return;
  }
  const wanted: PieceKind[] = next.slice(0, NEXT_COUNT);
  const current = host.children;
  if (current.length === wanted.length) {
    let same: boolean = true;
    for (let i = 0; i < wanted.length; i++) {
      const child = current[i] as unknown as HTMLElement | undefined;
      if (child === undefined || childKind(child) !== wanted[i]) {
        same = false;
        break;
      }
    }
    if (same) {
      return;
    }
  }
  replaceKids(
    host,
    wanted.map((kind: PieceKind): HTMLElement => createPieceChild(kind, host)),
  );
}

/**
 * Write one numeric stat, leaving the node untouched when unchanged.
 * @param node Stat element carrying pure numeric text.
 * @param value Numeric value to display.
 */
function setNumeric(node: HTMLElement | null, value: number): void {
  if (node === null) {
    return;
  }
  const text: string = String(Math.trunc(value));
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/**
 * Sync the stats row to pure numeric text.
 * @param scoreEl The `#score` element (null-safe no-op).
 * @param linesEl The `#lines` element (null-safe no-op).
 * @param levelEl The `#level` element (null-safe no-op).
 * @param score Total score.
 * @param lines Total lines cleared.
 * @param level Current level.
 */
export function syncStats(
  scoreEl: HTMLElement | null,
  linesEl: HTMLElement | null,
  levelEl: HTMLElement | null,
  score: number,
  lines: number,
  level: number,
): void {
  setNumeric(scoreEl, score);
  setNumeric(linesEl, lines);
  setNumeric(levelEl, level);
}

/**
 * Sync the event banner to uppercase bonus text (`TETRIS!`, `COMBO xN`).
 * Writes only when the text changes so sticky events survive stat syncs.
 * @param node The `#event-text` element (null-safe no-op).
 * @param text Uppercase event text, or empty to clear.
 */
export function syncEventText(node: HTMLElement | null, text: string): void {
  if (node === null) {
    return;
  }
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/**
 * Sync every side panel from one snapshot; repeats of the same snapshot
 * perform no DOM writes.
 * @param holdEl The `#hold-slot` element (null-safe no-op).
 * @param nextEl The `#next-queue` element (null-safe no-op).
 * @param scoreEl The `#score` element (null-safe no-op).
 * @param linesEl The `#lines` element (null-safe no-op).
 * @param levelEl The `#level` element (null-safe no-op).
 * @param data Plain panel snapshot.
 */
export function syncPanels(
  holdEl: HTMLElement | null,
  nextEl: HTMLElement | null,
  scoreEl: HTMLElement | null,
  linesEl: HTMLElement | null,
  levelEl: HTMLElement | null,
  data: PanelData,
): void {
  const signature: string =
    `${data.held ?? "-"}|${data.next.slice(0, NEXT_COUNT).join(",")}` +
    `|${data.score}|${data.lines}|${data.level}`;
  if (signature === lastSignature) {
    return;
  }
  lastSignature = signature;
  syncHold(holdEl, data.held);
  syncNext(nextEl, data.next);
  syncStats(scoreEl, linesEl, levelEl, data.score, data.lines, data.level);
}
