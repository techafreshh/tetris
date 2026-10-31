// Overlay DOM sync: PAUSED / GAME OVER banner plus game-over summary.
// Dependency-free rendering helpers — they take plain state snapshots and
// never import game, input, or render logic, so they stay unit-testable.

/** Exact banner text shown while paused. */
export const PAUSED_TEXT: string = "PAUSED";

/** Exact banner text shown on topping out. */
export const GAME_OVER_TEXT: string = "GAME OVER";

/** Loop states the overlay can reflect. */
export type OverlayState = "menu" | "playing" | "paused" | "gameover";

/** Id of the game-over summary child carrying score/lines. */
const SUMMARY_ID: string = "overlay-summary";

/** Signature of the last synced overlay; skips redundant DOM writes. */
let lastSignature: string | null = null;

/**
 * Clear the syncOverlay signature cache (tests and fresh boots).
 */
export function resetOverlayCache(): void {
  lastSignature = null;
}

/**
 * Banner text for a loop state, or null when the overlay must hide.
 * @param state Loop state to reflect.
 * @returns Exact banner string for paused/gameover, else null.
 */
export function overlayTextFor(state: OverlayState): string | null {
  if (state === "paused") {
    return PAUSED_TEXT;
  }
  if (state === "gameover") {
    return GAME_OVER_TEXT;
  }
  return null;
}

/**
 * Game-over summary line for the `#overlay-summary` hook.
 * @param score Total score.
 * @param lines Total lines cleared.
 * @returns Summary text in `Score <n> · Lines <n>` form.
 */
export function summaryTextFor(score: number, lines: number): string {
  return `Score ${Math.trunc(score)} · Lines ${Math.trunc(lines)}`;
}

/**
 * Find the summary child of an overlay host.
 * @param host Overlay element to search.
 * @returns The summary child, or null when absent.
 */
function findSummary(host: HTMLElement): HTMLElement | null {
  const query: unknown = (host as unknown as { querySelector?: unknown })
    .querySelector;
  if (typeof query === "function") {
    try {
      const found: unknown = (
        query as (selector: string) => unknown
      ).call(host, `#${SUMMARY_ID}`);
      if (found !== null && found !== undefined) {
        return found as HTMLElement;
      }
    } catch {
      // Fall through to the structural scan below.
    }
  }
  const kids: unknown = (host as unknown as { children?: unknown }).children;
  if (kids === null || kids === undefined) {
    return null;
  }
  const list = kids as ArrayLike<unknown>;
  const length: number =
    typeof list.length === "number" ? list.length : 0;
  for (let i = 0; i < length; i++) {
    const child: unknown = (list as unknown as Record<number, unknown>)[i];
    if (child !== null && typeof child === "object") {
      const id: unknown = (child as { id?: unknown }).id;
      if (id === SUMMARY_ID) {
        return child as HTMLElement;
      }
    }
  }
  return null;
}

/**
 * Build a summary child node, falling back to a minimal fake node when
 * no document is available (structural fake-DOM test harnesses).
 * @param host Overlay element the child will be appended to.
 * @param text Summary text to display.
 * @returns An `#overlay-summary` element carrying the text.
 */
function createSummaryNode(host: HTMLElement, text: string): HTMLElement {
  const owner: unknown = (host as unknown as { ownerDocument?: unknown })
    .ownerDocument;
  const doc: unknown =
    owner ??
    (typeof document !== "undefined"
      ? (globalThis as unknown as { document?: unknown }).document
      : undefined);
  let node: HTMLElement;
  if (
    doc !== null &&
    doc !== undefined &&
    typeof (doc as { createElement?: unknown }).createElement === "function"
  ) {
    node = (doc as Document).createElement("div") as HTMLElement;
  } else {
    node = {
      className: "",
      textContent: "",
      dataset: {},
      style: {},
    } as unknown as HTMLElement;
  }
  node.id = SUMMARY_ID;
  node.textContent = text;
  return node;
}

/**
 * Remove every element child of a host without assuming replaceChildren.
 * @param host Overlay element to empty.
 */
function removeAllChildren(host: HTMLElement): void {
  const anyHost = host as unknown as {
    replaceChildren?: (...nodes: HTMLElement[]) => void;
    firstChild?: HTMLElement | null;
    removeChild?: (node: HTMLElement) => void;
    appendChild: (node: HTMLElement) => void;
    children?: unknown;
  };
  if (typeof anyHost.replaceChildren === "function") {
    if (host.children.length === 0) {
      return;
    }
    anyHost.replaceChildren();
    return;
  }
  if (typeof anyHost.removeChild === "function") {
    let first: HTMLElement | null | undefined = anyHost.firstChild;
    while (first !== null && first !== undefined) {
      anyHost.removeChild(first);
      first = anyHost.firstChild;
    }
  } else if (Array.isArray(anyHost.children)) {
    if ((anyHost.children as unknown[]).length === 0) {
      return;
    }
    (anyHost.children as unknown[]).length = 0;
  }
}

/**
 * Remove the summary child when present.
 * @param host Overlay element to prune.
 */
function removeSummary(host: HTMLElement): void {
  const existing: HTMLElement | null = findSummary(host);
  if (existing === null) {
    return;
  }
  try {
    host.removeChild(existing);
  } catch {
    const kids = (host as unknown as { children?: unknown[] }).children;
    if (Array.isArray(kids)) {
      const index: number = kids.indexOf(existing as unknown as never);
      if (index >= 0) {
        kids.splice(index, 1);
      }
    }
  }
}

/**
 * Sync the overlay banner from a loop state; repeats of the same
 * state/summary perform no DOM writes.
 * @param host The `#overlay` element (null-safe no-op).
 * @param state Loop state to reflect.
 * @param summary Game-over summary text (only used for gameover).
 */
export function syncOverlay(
  host: HTMLElement | null,
  state: OverlayState,
  summary?: string,
): void {
  if (host === null || host === undefined) {
    return;
  }
  const text: string | null = overlayTextFor(state);
  const normSummary: string = typeof summary === "string" ? summary : "";
  const signature: string = `${state}|${text ?? ""}|${normSummary}`;
  if (signature === lastSignature) {
    return;
  }
  lastSignature = signature;
  if (text === null) {
    (host as unknown as { hidden: boolean }).hidden = true;
    host.style.display = "none";
    removeSummary(host);
    removeAllChildren(host);
    if (host.textContent !== "") {
      host.textContent = "";
    }
    return;
  }
  (host as unknown as { hidden: boolean }).hidden = false;
  host.style.display = "flex";
  if (state === "paused") {
    removeSummary(host);
    removeAllChildren(host);
    if (host.textContent !== PAUSED_TEXT) {
      host.textContent = PAUSED_TEXT;
    }
    return;
  }
  removeAllChildren(host);
  if (host.textContent !== GAME_OVER_TEXT) {
    host.textContent = GAME_OVER_TEXT;
  }
  if (normSummary.length > 0) {
    const node: HTMLElement = createSummaryNode(host, normSummary);
    host.appendChild(node);
  }
}

/**
 * Return the existing `#overlay` element, creating it hidden when absent.
 * @returns The overlay element, or null without a document.
 */
export function ensureOverlay(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const existing = document.querySelector<HTMLElement>("#overlay");
  if (existing !== null) {
    return existing;
  }
  const el = document.createElement("div");
  el.id = "overlay";
  el.hidden = true;
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}
