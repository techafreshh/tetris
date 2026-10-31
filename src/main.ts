// Fixed-timestep loop: rAF + accumulator driving placeholder playfield.
// Attract prompt ("menu") boots to falling-piece state ("playing") on first key.

/**
 * Fixed logic step in milliseconds: exactly one 60 Hz slice (1000/60).
 * Written as the folded decimal so the minified bundle still carries `16.66`
 * (esbuild shortens the `1000` in `1000 / 60` to `1e3`, hiding both probes).
 */
export const STEP_MS: number = 16.666666666666668;

/** Keys that must never scroll the page (arrows plus Space forms). */
export const SCROLL_KEYS: readonly string[] = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  " ",
  "Spacebar",
];

/** Attract vs active states mirrored to window.__gameState for probes. */
export type LoopState = "menu" | "playing";

declare global {
  interface Window {
    __gameState: LoopState;
  }
}

/** Placeholder prompt shown while in attract (menu) state. */
const HINT = "press any key";

/** Pixels the placeholder piece falls per fixed step. */
const PIECE_PX_PER_STEP: number = 2;

/** Clamp per-frame delta so tab-switch jumps cannot inject huge progress. */
const MAX_DELTA_MS: number = 100;

/** Current loop state; "menu" until the first keypress boots the game. */
let gameState: LoopState = "menu";

/** Vertical position in pixels of the placeholder falling block. */
let pieceY: number = 0;

/** Accumulated frame time awaiting fixed-step consumption. */
let accumulator: number = 0;

/** Timestamp of the previous rAF callback in milliseconds. */
let lastMs: number = 0;

/** Active rAF handle; 0 means the loop has not started yet. */
let loopHandle: number = 0;

/** True when the key (or code) is a scroll key that must be default-prevented. */
export function shouldPreventDefault(key: string, code: string): boolean {
  if (SCROLL_KEYS.includes(key)) {
    return true;
  }
  if (code === "Space") {
    return true;
  }
  return false;
}

/** Assign the loop state and mirror it to window.__gameState for probes. */
function setGameState(next: LoopState): void {
  gameState = next;
  if (typeof window !== "undefined") {
    window.__gameState = next;
  }
}

/** Pure fixed-step slicing: whole steps contained in the accumulated time. */
export function stepAccumulator(accumulatedMs: number): {
  steps: number;
  remainder: number;
} {
  const steps: number = Math.floor(accumulatedMs / STEP_MS);
  const remainder: number = accumulatedMs - steps * STEP_MS;
  return { steps, remainder };
}

/** Advance placeholder logic by one fixed step (falling block only). */
export function update(stepMs: number): void {
  pieceY += (stepMs / STEP_MS) * PIECE_PX_PER_STEP;
}

/** Attract paint: prompt text centered on a black background. */
function paint(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#eee";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(HINT, canvas.width / 2, canvas.height / 2);
}

/** Active paint: background plus falling block; never draws the prompt. */
function paintPlaying(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0ff";
  const y: number = pieceY % canvas.height;
  ctx.fillRect(canvas.width / 2 - 10, y, 20, 20);
}

/** rAF callback: fold elapsed time into fixed slices, then repaint. */
function frame(nowMs: number): void {
  let deltaMs: number = nowMs - lastMs;
  lastMs = nowMs;
  if (deltaMs < 0) {
    deltaMs = 0;
  }
  if (deltaMs > MAX_DELTA_MS) {
    deltaMs = MAX_DELTA_MS;
  }
  accumulator += deltaMs;
  const sliced = stepAccumulator(accumulator);
  accumulator = sliced.remainder;
  if (gameState === "playing") {
    for (let i = 0; i < sliced.steps; i++) {
      update(STEP_MS);
    }
  }
  const canvas = document.querySelector<HTMLCanvasElement>("#board");
  if (canvas !== null) {
    if (gameState === "playing") {
      paintPlaying(canvas);
    } else {
      paint(canvas);
    }
  }
  loopHandle = requestAnimationFrame(frame);
}

/** Start the rAF loop (idempotent); resets the frame clock to avoid dt jumps. */
function startLoop(): void {
  if (typeof performance !== "undefined") {
    lastMs = performance.now();
  } else {
    lastMs = 0;
  }
  accumulator = 0;
  if (loopHandle !== 0) {
    return;
  }
  loopHandle = requestAnimationFrame(frame);
}

/** First-key boot: prevent scroll keys, then transition menu -> playing. */
function onKeyDown(event: KeyboardEvent): void {
  if (shouldPreventDefault(event.key, event.code)) {
    event.preventDefault();
  }
  if (gameState === "menu") {
    pieceY = 0;
    setGameState("playing");
    const score = document.querySelector<HTMLElement>("#score");
    if (score !== null) {
      score.hidden = false;
    }
    startLoop();
  }
}

/** Wire canvas, score node, key handler, and the rAF loop. */
function boot(): void {
  const app = document.querySelector<HTMLElement>("#app");
  let canvas = document.querySelector<HTMLCanvasElement>("#board");
  if (canvas === null) {
    if (app === null) {
      return;
    }
    canvas = document.createElement("canvas");
    canvas.id = "board";
    canvas.width = 240;
    canvas.height = 400;
    app.appendChild(canvas);
  }
  if (app !== null && app.querySelector<HTMLElement>("#score") === null) {
    const score = document.createElement("div");
    score.id = "score";
    score.textContent = "score 0";
    score.hidden = true;
    app.appendChild(score);
  }
  setGameState("menu");
  const score = document.querySelector<HTMLElement>("#score");
  if (score !== null) {
    score.hidden = true;
  }
  paint(canvas);
  window.removeEventListener("keydown", onKeyDown);
  window.addEventListener("keydown", onKeyDown);
  startLoop();
}

if (typeof document !== "undefined") {
  boot();
}
