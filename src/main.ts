// Fixed-timestep loop: rAF + accumulator driving the live core Game.
// Keyboard intents (DAS/ARR) drained once per frame into game actions.
// Attract prompt ("menu") boots to live play ("playing") on first key.
// Side panels (HOLD/NEXT/stats) sync from the game every frame and after
// every mutating call so black-box probes observe queue shifts and score.

import { COLS } from "./core/constants";
import { createGame, type Game } from "./core/game";
import { CSS_HEIGHT, CSS_WIDTH, renderPlayfield } from "./render/canvas";
import type { RenderState } from "./render/canvas";
import { createEffects } from "./render/effects";
import type { Effects } from "./render/effects";
import { createKeyboard } from "./input/keyboard";
import type { InputIntent, KeyboardInput } from "./input/keyboard";
import { resetPanelsCache, syncEventText, syncPanels } from "./ui/panels";
import type { PanelData } from "./ui/panels";
import { ensureOverlay, syncOverlay } from "./ui/overlay";

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

/** Placeholder column used when no piece is falling (central origin). */
export const PIECE_START_X: number = 5;

/** Deterministic seed for the live game (reset on boot and restart). */
export const DEFAULT_SEED: number = 0;

/** Attract, active, paused, and terminal states mirrored to window.__gameState. */
export type LoopState = "menu" | "playing" | "paused" | "gameover";

declare global {
  interface Window {
    __gameState: LoopState;
    __pieceX: number;
    __muted: boolean;
    __game: Game;
    __debugClear: (lines: number, tSpin?: boolean) => void;
  }
}

/** Placeholder prompt shown while in attract (menu) state. */
const HINT = "press any key";

/** Clamp per-frame delta so tab-switch jumps cannot inject huge progress. */
const MAX_DELTA_MS: number = 100;

/** Mutating Game methods mirrored to the panels after each direct call. */
const PROBE_SYNCED_METHODS: readonly string[] = [
  "moveLeft",
  "moveRight",
  "rotateCW",
  "rotateCCW",
  "softDrop",
  "hardDrop",
  "hold",
  "update",
  "start",
  "pause",
  "resume",
  "debugClear",
];

/** Current loop state; "menu" until the first keypress boots the game. */
let gameState: LoopState = "menu";

/** Live core game driven by the loop and drained keyboard intents. */
let game: Game = createGame(DEFAULT_SEED);

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

/** Renderer-only juice state (flash/collapse/shake); never gates logic. */
let effects: Effects = createEffects();

/** Last lockSeq forwarded to effects; detects new locks without polling rows. */
let lastSeenSeq: number = 0;

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
  syncOverlayFromState();
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
  if (game.state === "gameover") {
    gameState = "gameover";
  }
  window.__gameState = gameState;
  const active = game.active;
  window.__pieceX = active !== null ? active.x : PIECE_START_X;
  window.__muted = muted;
  window.__game = game;
  syncOverlayFromState();
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
 * Advance live logic by one fixed step, plus one soft-drop cell while
 * soft-drop is held.
 */
export function update(stepMs: number, softDropHeld: boolean = false): void {
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    return;
  }
  if (gameState !== "playing") {
    return;
  }
  game.update(stepMs);
  if (softDropHeld) {
    game.softDrop();
  }
  if (game.state === "gameover") {
    setGameState("gameover");
  }
}

/** Effect-clock timestamp: performance time where available, else epoch millis. */
function effectNow(): number {
  if (
    typeof performance !== "undefined" &&
    Number.isFinite(performance.now())
  ) {
    return performance.now();
  }
  return Date.now();
}

/**
 * Forward new lock events from the game into the juice state machine.
 * Resets tracking when lockSeq wrapped (game restarted) instead of
 * replaying stale events.
 */
function syncEffects(nowMs: number): void {
  const seq: number = game.lockSeq;
  if (seq < lastSeenSeq) {
    lastSeenSeq = seq;
    return;
  }
  if (seq === lastSeenSeq) {
    return;
  }
  lastSeenSeq = seq;
  const event = game.lastLockEvent;
  if (event === null || event.seq !== seq) {
    return;
  }
  const now: number = Number.isFinite(nowMs) ? nowMs : 0;
  if (event.rows.length > 0) {
    effects.notifyClear(event.count, event.rows, event.tSpin, now);
  }
  effects.notifyLock(event.cells, now);
}

/** Push held/next/score/lines/level from the live game into the DOM panels. */
function syncFromGame(): void {
  if (typeof document === "undefined") {
    return;
  }
  const hold = document.querySelector<HTMLElement>("#hold-slot");
  const queue = document.querySelector<HTMLElement>("#next-queue");
  const score = document.querySelector<HTMLElement>("#score");
  const lines = document.querySelector<HTMLElement>("#lines");
  const level = document.querySelector<HTMLElement>("#level");
  const eventText = document.querySelector<HTMLElement>("#event-text");
  if (
    hold === null &&
    queue === null &&
    score === null &&
    lines === null &&
    level === null &&
    eventText === null
  ) {
    return;
  }
  const data: PanelData = {
    held: game.held,
    next: game.next,
    score: game.score,
    lines: game.lines,
    level: game.level,
  };
  syncPanels(hold, queue, score, lines, level, data);
  syncEventText(eventText, game.lastEvent);
}

/** Push the loop state into the `#overlay` banner plus game-over summary. */
function syncOverlayFromState(): void {
  if (typeof document === "undefined") {
    return;
  }
  const overlay = document.querySelector<HTMLElement>("#overlay");
  if (overlay === null) {
    return;
  }
  if (gameState === "gameover") {
    syncOverlay(overlay, gameState, `Score ${game.score} · Lines ${game.lines}`);
  } else {
    syncOverlay(overlay, gameState);
  }
}

/**
 * Wrap mutating Game methods so direct window.__game calls (hardDrop
 * probes) repaint the panels synchronously instead of waiting a frame.
 */
function patchGameSync(target: Game): void {
  const record = target as unknown as Record<string, unknown>;
  for (const key of PROBE_SYNCED_METHODS) {
    const original: unknown = record[key];
    if (typeof original !== "function") {
      continue;
    }
    const fn = original as (...args: never[]) => unknown;
    if (
      (fn as unknown as { __panelsWrapped?: boolean }).__panelsWrapped === true
    ) {
      continue;
    }
    const wrapped = (...args: never[]): unknown => {
      const result: unknown = fn.apply(target, args);
      syncFromGame();
      if (target.state === "gameover") {
        setGameState("gameover");
      }
      mirrorProbes();
      if (key === "start") {
        effects.clear();
        lastSeenSeq = target.lockSeq;
      } else {
        syncEffects(effectNow());
      }
      return result;
    };
    (wrapped as unknown as { __panelsWrapped?: boolean }).__panelsWrapped =
      true;
    record[key] = wrapped;
  }
}

/** Apply one drained intent to the live game. */
function applyIntent(intent: InputIntent): void {
  if (intent === "mute") {
    setMuted(!muted);
    return;
  }
  if (gameState === "menu") {
    return;
  }
  if (gameState === "paused") {
    if (intent === "pause") {
      game.resume();
      setGameState("playing");
    } else if (intent === "restart") {
      game.start(DEFAULT_SEED);
      resetPanelsCache();
      syncFromGame();
      setGameState("playing");
    }
    return;
  }
  if (gameState === "gameover") {
    if (intent === "restart") {
      game.start(DEFAULT_SEED);
      resetPanelsCache();
      syncFromGame();
      setGameState("playing");
    }
    return;
  }
  switch (intent) {
    case "left-press":
    case "left-held":
      game.moveLeft();
      break;
    case "right-press":
    case "right-held":
      game.moveRight();
      break;
    case "rotate-cw":
      game.rotateCW();
      break;
    case "rotate-ccw":
      game.rotateCCW();
      break;
    case "hard-drop":
      game.hardDrop();
      break;
    case "hold":
      game.hold();
      break;
    case "pause":
      game.pause();
      setGameState("paused");
      break;
    case "restart":
      game.start(DEFAULT_SEED);
      resetPanelsCache();
      syncFromGame();
      setGameState("playing");
      break;
    default:
      break;
  }
  if (game.state === "gameover") {
    setGameState("gameover");
  }
}

/** Build the renderer input from the live game (board plus falling piece). */
function currentRenderState(): RenderState {
  return { board: game.board, active: game.active };
}

/** Attract paint: live playfield plus prompt text centered on top. */
function paint(canvas: HTMLCanvasElement): void {
  renderPlayfield(canvas, currentRenderState());
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

/** Active paint: live playfield with falling piece, ghost, and juice overlays. */
function paintPlaying(canvas: HTMLCanvasElement, nowMs: number): void {
  renderPlayfield(canvas, currentRenderState(), effects.snapshot(nowMs));
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
  if (intents.length > 0) {
    syncFromGame();
  }
  accumulator += deltaMs;
  const sliced = stepAccumulator(accumulator);
  accumulator = sliced.remainder;
  if (gameState === "playing") {
    const softHeld: boolean = keyboard.isHeld("softdrop");
    for (let i = 0; i < sliced.steps; i++) {
      update(STEP_MS, softHeld);
      if (gameState !== "playing") {
        break;
      }
    }
    syncFromGame();
  }
  syncEffects(currentMs);
  mirrorProbes();
  const canvas = document.querySelector<HTMLCanvasElement>("#board");
  if (canvas !== null) {
    if (
      gameState === "playing" ||
      gameState === "paused" ||
      gameState === "gameover"
    ) {
      paintPlaying(canvas, currentMs);
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
  setGameState("playing");
  const stats = document.querySelector<HTMLElement>("#stats");
  if (stats !== null) {
    stats.hidden = false;
  }
  syncFromGame();
  startLoop();
}

/** Window blur: input is already cleared; pause active play. */
function handleBlurPause(): void {
  if (gameState === "playing") {
    game.pause();
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
  if (
    gameState === "playing" ||
    gameState === "paused" ||
    gameState === "gameover"
  ) {
    paintPlaying(canvas, effectNow());
  } else {
    paint(canvas);
  }
}

/** Test hook: force a synthetic clear through the shared scoring path. */
function debugClear(lines: number, tSpin?: boolean): void {
  if (game.state === "gameover") {
    game.start(DEFAULT_SEED);
    resetPanelsCache();
  }
  if (gameState !== "playing") {
    setGameState("playing");
  }
  if (typeof document !== "undefined") {
    const stats = document.querySelector<HTMLElement>("#stats");
    if (stats !== null) {
      stats.hidden = false;
    }
  }
  game.debugClear(lines, tSpin ?? false);
  syncFromGame();
  mirrorProbes();
}

/** Wire canvas, panels, keyboard intents, and the rAF loop. */
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
  patchGameSync(game);
  resetPanelsCache();
  ensureOverlay();
  syncOverlayFromState();
  keyboard.detach();
  keyboard = createKeyboard();
  keyboard.attach({ onAnyKey: handleAnyKey, onBlur: handleBlurPause });
  game.start(DEFAULT_SEED);
  setGameState("menu");
  setMuted(false);
  const stats = document.querySelector<HTMLElement>("#stats");
  if (stats !== null) {
    stats.hidden = true;
  }
  syncFromGame();
  paint(canvas);
  mirrorProbes();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleResize);
    window.__debugClear = debugClear;
  }
  startLoop();
}

if (typeof document !== "undefined") {
  boot();
}
