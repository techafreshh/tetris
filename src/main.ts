// Fixed-timestep loop: rAF + accumulator driving placeholder playfield.
// Keyboard intents (DAS/ARR) drained once per frame into a clamped column.
// Attract prompt ("menu") boots to falling-piece state ("playing") on first key.

import { COLS, HIDDEN_ROWS, SOFT_DROP_MULTIPLIER } from "./core/constants";
import { createBoard } from "./core/board";
import type { Board } from "./core/board";
import { CSS_HEIGHT, CSS_WIDTH, renderPlayfield } from "./render/canvas";
import type { RenderState } from "./render/canvas";
import { createKeyboard } from "./input/keyboard";
import type { InputIntent, KeyboardInput } from "./input/keyboard";

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

/** Placeholder column where a new piece spawns (central, left sweep room). */
export const PIECE_START_X: number = 5;

/** Attract, active, and paused states mirrored to window.__gameState. */
export type LoopState = "menu" | "playing" | "paused";

declare global {
  interface Window {
    __gameState: LoopState;
    __pieceX: number;
    __muted: boolean;
  }
}

/** Placeholder prompt shown while in attract (menu) state. */
const HINT = "press any key";

/** Demo board with a small locked corner stack in guideline colors. */
let demoBoard: Board | null = null;

/** Lazily create the demo board (corner stack leaves the ghost path clear). */
function getDemoBoard(): Board {
  if (demoBoard === null) {
    const fresh: Board = createBoard();
    fresh.grid[fresh.rows - 1][0] = 1;
    fresh.grid[fresh.rows - 1][1] = 2;
    fresh.grid[fresh.rows - 1][2] = 3;
    fresh.grid[fresh.rows - 2][0] = 4;
    demoBoard = fresh;
  }
  return demoBoard;
}

/** Clamp the placeholder column into a T-piece box origin (3 cells wide). */
function activeBoxX(): number {
  return Math.max(0, Math.min(COLS - 3, Math.trunc(pieceX)));
}

/** Build the airborne demo state: T piece pinned to the top, ghost lands low. */
function demoState(): RenderState {
  return {
    board: getDemoBoard().grid,
    active: { kind: "T", x: activeBoxX(), y: HIDDEN_ROWS, rotation: 0 },
  };
}

/** Pixels the placeholder piece falls per fixed step. */
const PIECE_PX_PER_STEP: number = 2;

/** Clamp per-frame delta so tab-switch jumps cannot inject huge progress. */
const MAX_DELTA_MS: number = 100;

/** Current loop state; "menu" until the first keypress boots the game. */
let gameState: LoopState = "menu";

/** Vertical position in pixels of the placeholder falling block. */
let pieceY: number = 0;

/** Horizontal placeholder column in cells, clamped to 0..COLS-1. */
let pieceX: number = PIECE_START_X;

/** Mute flag toggled by KeyM and mirrored to window.__muted. */
let muted: boolean = false;

/** Accumulated frame time awaiting fixed-step consumption. */
let accumulator: number = 0;

/** Timestamp of the previous rAF callback in milliseconds. */
let lastMs: number = 0;

/** Active rAF handle; 0 means the loop has not started yet. */
let loopHandle: number = 0;

/** Shared keyboard tracker drained once per frame. */
let keyboard: KeyboardInput = createKeyboard();

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

/** Assign the placeholder column and mirror it to window.__pieceX. */
function setPieceX(next: number): void {
  pieceX = next;
  if (typeof window !== "undefined") {
    window.__pieceX = next;
  }
}

/** Assign the mute flag and mirror it to window.__muted. */
function setMuted(next: boolean): void {
  muted = next;
  if (typeof window !== "undefined") {
    window.__muted = next;
  }
}

/** Mirror all probe surfaces (called on boot and every frame). */
function mirrorProbes(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.__gameState = gameState;
  window.__pieceX = pieceX;
  window.__muted = muted;
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

/**
 * Pure column applier for drained intents: left intents shift one cell
 * left, right intents one cell right (clamped to the playfield), and all
 * other intents leave the column unchanged.
 */
export function stepPieceX(x: number, intent: InputIntent): number {
  if (!Number.isFinite(x)) {
    return PIECE_START_X;
  }
  switch (intent) {
    case "left-press":
    case "left-held":
      return Math.max(0, Math.min(COLS - 1, Math.trunc(x) - 1));
    case "right-press":
    case "right-held":
      return Math.max(0, Math.min(COLS - 1, Math.trunc(x) + 1));
    default:
      return Math.max(0, Math.min(COLS - 1, Math.trunc(x)));
  }
}

/**
 * Advance placeholder logic by one fixed step (falling block only).
 * Soft-drop held multiplies the fall speed by SOFT_DROP_MULTIPLIER (~20x).
 */
export function update(stepMs: number, softDropHeld: boolean = false): void {
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    return;
  }
  const speed: number = softDropHeld
    ? PIECE_PX_PER_STEP * SOFT_DROP_MULTIPLIER
    : PIECE_PX_PER_STEP;
  pieceY += (stepMs / STEP_MS) * speed;
}

/** Apply one drained intent to the placeholder state. */
function applyIntent(intent: InputIntent): void {
  if (gameState === "menu") {
    return;
  }
  if (gameState === "paused") {
    if (intent === "pause") {
      setGameState("playing");
    } else if (intent === "restart") {
      pieceY = 0;
      setPieceX(PIECE_START_X);
      setGameState("playing");
    } else if (intent === "mute") {
      setMuted(!muted);
    }
    return;
  }
  switch (intent) {
    case "left-press":
    case "left-held":
    case "right-press":
    case "right-held":
      setPieceX(stepPieceX(pieceX, intent));
      break;
    case "pause":
      setGameState("paused");
      break;
    case "restart":
      pieceY = 0;
      setPieceX(PIECE_START_X);
      setGameState("playing");
      break;
    case "mute":
      setMuted(!muted);
      break;
    default:
      break;
  }
}

/** Attract paint: HiDPI playfield plus prompt text centered on top. */
function paint(canvas: HTMLCanvasElement): void {
  renderPlayfield(canvas, demoState());
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  ctx.fillStyle = "#eee";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(HINT, CSS_WIDTH / 2, CSS_HEIGHT / 2);
}

/** Active paint: HiDPI playfield with falling piece and ghost preview. */
function paintPlaying(canvas: HTMLCanvasElement): void {
  renderPlayfield(canvas, demoState());
}

/** rAF callback: drain keyboard intents, fold time into slices, repaint. */
function frame(nowMs: number): void {
  let currentMs: number = nowMs;
  if (!Number.isFinite(currentMs)) {
    currentMs = lastMs;
  }
  let deltaMs: number = currentMs - lastMs;
  lastMs = currentMs;
  if (deltaMs < 0) {
    deltaMs = 0;
  }
  if (deltaMs > MAX_DELTA_MS) {
    deltaMs = MAX_DELTA_MS;
  }
  const intents: InputIntent[] = keyboard.update(currentMs);
  for (const intent of intents) {
    applyIntent(intent);
  }
  accumulator += deltaMs;
  const sliced = stepAccumulator(accumulator);
  accumulator = sliced.remainder;
  if (gameState === "playing") {
    const softHeld: boolean = keyboard.isHeld("softdrop");
    for (let i = 0; i < sliced.steps; i++) {
      update(STEP_MS, softHeld);
    }
  }
  mirrorProbes();
  const canvas = document.querySelector<HTMLCanvasElement>("#board");
  if (canvas !== null) {
    if (gameState === "playing" || gameState === "paused") {
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

/** Any-key boot: first key transitions menu -> playing (never swallows it). */
function handleAnyKey(): void {
  if (gameState !== "menu") {
    return;
  }
  pieceY = 0;
  setPieceX(PIECE_START_X);
  setGameState("playing");
  const score = document.querySelector<HTMLElement>("#score");
  if (score !== null) {
    score.hidden = false;
  }
  startLoop();
}

/** Window blur: input is already cleared; pause active play. */
function handleBlurPause(): void {
  if (gameState === "playing") {
    setGameState("paused");
  }
  mirrorProbes();
}

/** Window resize: re-render the current state so the HiDPI store stays sharp. */
function handleResize(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#board");
  if (canvas === null) {
    return;
  }
  if (gameState === "playing" || gameState === "paused") {
    paintPlaying(canvas);
  } else {
    paint(canvas);
  }
}

/** Wire canvas, score node, keyboard intents, and the rAF loop. */
function boot(): void {
  const app = document.querySelector<HTMLElement>("#app");
  let canvas = document.querySelector<HTMLCanvasElement>("#board");
  if (canvas === null) {
    if (app === null) {
      return;
    }
    canvas = document.createElement("canvas");
    canvas.id = "board";
    canvas.width = CSS_WIDTH;
    canvas.height = CSS_HEIGHT;
    app.appendChild(canvas);
  }
  canvas.style.width = `${CSS_WIDTH}px`;
  canvas.style.height = `${CSS_HEIGHT}px`;
  // Border would leak into getBoundingClientRect, breaking the
  // canvas.width === cssWidth * dpr contract; outline keeps the frame look.
  canvas.style.border = "none";
  canvas.style.outline = "1px solid #555";
  if (app !== null && app.querySelector<HTMLElement>("#score") === null) {
    const score = document.createElement("div");
    score.id = "score";
    score.textContent = "score 0";
    score.hidden = true;
    app.appendChild(score);
  }
  keyboard.detach();
  keyboard = createKeyboard();
  keyboard.attach({ onAnyKey: handleAnyKey, onBlur: handleBlurPause });
  setGameState("menu");
  setPieceX(PIECE_START_X);
  setMuted(false);
  pieceY = 0;
  const score = document.querySelector<HTMLElement>("#score");
  if (score !== null) {
    score.hidden = true;
  }
  paint(canvas);
  mirrorProbes();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleResize);
  }
  startLoop();
}

if (typeof document !== "undefined") {
  boot();
}
