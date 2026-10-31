// Keyboard intents with DAS/ARR and soft-drop handling.
// Pure logic module — no DOM, no rendering, no timing APIs in the core.
// All `window` access is isolated in `attach()`/`detach()`; the DAS/ARR
// state machine takes explicit `(code, nowMs)` so tests drive it directly.

/** Delayed Auto Shift in ms; canonical table lives in src/core/constants.ts. */
export const DAS_MS: number = 167;
/** Auto Repeat Rate in ms; canonical table lives in src/core/constants.ts. */
export const ARR_MS: number = 33;

/** Discrete intents drained per frame; core decides their meaning. */
export type InputIntent =
  | "left-press"
  | "left-held"
  | "right-press"
  | "right-held"
  | "rotate-ccw"
  | "rotate-cw"
  | "hard-drop"
  | "hold"
  | "pause"
  | "restart"
  | "mute";

/** Held-state queries for directions plus soft-drop. */
export type HeldKey = "left" | "right" | "softdrop";

/** Internal direction tracker for DAS/ARR repeats. */
type Direction = "left" | "right";

/** Callbacks wired by `attach()` for boot and blur-pause. */
export interface KeyboardAttachCallbacks {
  /** Invoked on every non-repeat keydown after it is queued. */
  onAnyKey?: () => void;
  /** Invoked on window blur after state is cleared. */
  onBlur?: () => void;
}

/**
 * Game-loop-driven key-state tracker: keydown enqueues a single press
 * intent, `update(nowMs)` emits `*-held` repeats per DAS/ARR, and the
 * queue is drained once per frame. OS auto-repeat is always ignored.
 */
export class KeyboardInput {
  /** Queued intents awaiting the next `update()` drain. */
  private queue: InputIntent[] = [];
  /** True while ArrowLeft is physically held. */
  private heldLeft: boolean = false;
  /** True while ArrowRight is physically held. */
  private heldRight: boolean = false;
  /** True while ArrowDown (soft-drop) is physically held. */
  private heldSoftdrop: boolean = false;
  /** Press-order stack; the tail is the repeat winner. */
  private order: Direction[] = [];
  /** Timestamp at which the active direction next repeats. */
  private nextRepeatAt: number = 0;
  /** Most recent timestamp seen (drives resume timers). */
  private lastNow: number = 0;
  /** True while window listeners are attached. */
  private isAttached: boolean = false;
  /** Bound keydown handler for `detach()`. */
  private keyDownHandler: ((event: KeyboardEvent) => void) | null = null;
  /** Bound keyup handler for `detach()`. */
  private keyUpHandler: ((event: KeyboardEvent) => void) | null = null;
  /** Bound blur handler for `detach()`. */
  private blurHandler: (() => void) | null = null;

  /**
   * Record a key press: queue one press/discrete intent and arm DAS.
   * Duplicate downs for an already-held direction add nothing, and
   * OS auto-repeat (`isRepeat`) is dropped so the loop owns repetition.
   */
  public down(code: string, nowMs: number, isRepeat: boolean = false): void {
    if (isRepeat) {
      return;
    }
    const now: number = Number.isFinite(nowMs) ? nowMs : this.lastNow;
    this.lastNow = now;
    switch (code) {
      case "ArrowLeft":
        this.pressDirection("left", now);
        break;
      case "ArrowRight":
        this.pressDirection("right", now);
        break;
      case "ArrowDown":
        this.heldSoftdrop = true;
        break;
      case "ArrowUp":
      case "KeyX":
        this.queue.push("rotate-cw");
        break;
      case "KeyZ":
        this.queue.push("rotate-ccw");
        break;
      case "Space":
      case "Spacebar":
        this.queue.push("hard-drop");
        break;
      case "KeyC":
        this.queue.push("hold");
        break;
      case "Escape":
        this.queue.push("pause");
        break;
      case "KeyR":
        this.queue.push("restart");
        break;
      case "KeyM":
        this.queue.push("mute");
        break;
      default:
        break;
    }
  }

  /**
   * Release a held key. Releasing the repeat winner resumes the other
   * direction (when still held) with a fresh DAS window.
   */
  public up(code: string, nowMs?: number): void {
    const now: number =
      nowMs !== undefined && Number.isFinite(nowMs) ? nowMs : this.lastNow;
    if (Number.isFinite(now)) {
      this.lastNow = now;
    }
    switch (code) {
      case "ArrowLeft":
        if (!this.heldLeft) {
          return;
        }
        this.heldLeft = false;
        this.removeDirection("left");
        this.restartResumeTimer(now);
        break;
      case "ArrowRight":
        if (!this.heldRight) {
          return;
        }
        this.heldRight = false;
        this.removeDirection("right");
        this.restartResumeTimer(now);
        break;
      case "ArrowDown":
        this.heldSoftdrop = false;
        break;
      default:
        break;
    }
  }

  /**
   * Advance repeat timers and drain the intent queue. Emits `*-held`
   * for the most-recently-held direction once DAS has elapsed, then
   * every ARR interval. Non-finite timestamps drain without advancing.
   */
  public update(nowMs: number): InputIntent[] {
    if (!Number.isFinite(nowMs)) {
      const pending: InputIntent[] = this.queue;
      this.queue = [];
      return pending;
    }
    this.lastNow = nowMs;
    const active: Direction | undefined = this.order[this.order.length - 1];
    if (active !== undefined && nowMs >= this.nextRepeatAt) {
      const intent: InputIntent =
        active === "left" ? "left-held" : "right-held";
      while (this.nextRepeatAt <= nowMs) {
        this.queue.push(intent);
        this.nextRepeatAt += ARR_MS;
      }
    }
    const drained: InputIntent[] = this.queue;
    this.queue = [];
    return drained;
  }

  /** True while the given direction or soft-drop is physically held. */
  public isHeld(key: HeldKey): boolean {
    switch (key) {
      case "left":
        return this.heldLeft;
      case "right":
        return this.heldRight;
      case "softdrop":
        return this.heldSoftdrop;
      default:
        return false;
    }
  }

  /** Reset held keys, DAS timers, and the queued intents. */
  public clear(): void {
    this.queue = [];
    this.heldLeft = false;
    this.heldRight = false;
    this.heldSoftdrop = false;
    this.order = [];
    this.nextRepeatAt = 0;
  }

  /**
   * Bind window keydown/keyup/blur to this tracker. No-op without a
   * window or when already attached; `detach()` removes the listeners.
   */
  public attach(callbacks: KeyboardAttachCallbacks = {}): void {
    if (typeof window === "undefined") {
      return;
    }
    if (this.isAttached) {
      return;
    }
    const self: KeyboardInput = this;
    const keyDownHandler = (event: KeyboardEvent): void => {
      if (
        event.code === "ArrowLeft" ||
        event.code === "ArrowRight" ||
        event.code === "ArrowUp" ||
        event.code === "ArrowDown" ||
        event.code === "Space" ||
        event.key === " " ||
        event.key === "Spacebar"
      ) {
        event.preventDefault();
      }
      if (event.repeat) {
        return;
      }
      const now: number =
        typeof performance !== "undefined" && Number.isFinite(performance.now())
          ? performance.now()
          : Date.now();
      self.down(event.code, now, event.repeat);
      if (callbacks.onAnyKey !== undefined) {
        callbacks.onAnyKey();
      }
    };
    const keyUpHandler = (event: KeyboardEvent): void => {
      const now: number =
        typeof performance !== "undefined" && Number.isFinite(performance.now())
          ? performance.now()
          : Date.now();
      self.up(event.code, now);
    };
    const blurHandler = (): void => {
      self.clear();
      if (callbacks.onBlur !== undefined) {
        callbacks.onBlur();
      }
    };
    this.keyDownHandler = keyDownHandler;
    this.keyUpHandler = keyUpHandler;
    this.blurHandler = blurHandler;
    window.addEventListener("keydown", keyDownHandler);
    window.addEventListener("keyup", keyUpHandler);
    window.addEventListener("blur", blurHandler);
    this.isAttached = true;
  }

  /** Remove window listeners installed by `attach()`. */
  public detach(): void {
    if (typeof window === "undefined") {
      return;
    }
    if (!this.isAttached) {
      return;
    }
    if (this.keyDownHandler !== null) {
      window.removeEventListener("keydown", this.keyDownHandler);
    }
    if (this.keyUpHandler !== null) {
      window.removeEventListener("keyup", this.keyUpHandler);
    }
    if (this.blurHandler !== null) {
      window.removeEventListener("blur", this.blurHandler);
    }
    this.keyDownHandler = null;
    this.keyUpHandler = null;
    this.blurHandler = null;
    this.isAttached = false;
  }

  /** Fresh press arms DAS for the newly active direction. */
  private pressDirection(dir: Direction, now: number): void {
    if (dir === "left") {
      if (this.heldLeft) {
        return;
      }
      this.heldLeft = true;
      this.order.push("left");
      this.queue.push("left-press");
    } else {
      if (this.heldRight) {
        return;
      }
      this.heldRight = true;
      this.order.push("right");
      this.queue.push("right-press");
    }
    this.nextRepeatAt = now + DAS_MS;
  }

  /** Remove a direction from the press-order stack. */
  private removeDirection(dir: Direction): void {
    this.order = this.order.filter((entry: Direction): boolean => entry !== dir);
  }

  /** Give a resumed direction a fresh DAS window from now. */
  private restartResumeTimer(now: number): void {
    if (this.order.length === 0) {
      return;
    }
    if (!Number.isFinite(now)) {
      return;
    }
    this.nextRepeatAt = now + DAS_MS;
  }
}

/** Create a fresh key-state tracker. */
export function createKeyboard(): KeyboardInput {
  return new KeyboardInput();
}
