import { describe, expect, it } from "vitest";
import { ARR_MS, DAS_MS, createKeyboard } from "./keyboard";
import { ARR_MS as CORE_ARR_MS, DAS_MS as CORE_DAS_MS } from "../core/constants";

describe("keyboard press and DAS edge", (): void => {
  it("emits left-press on drain after a fresh ArrowLeft down", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    expect(keyboard.update(0)).toEqual(["left-press"]);
  });

  it("emits no repeat at 166ms and the first held at 167ms", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    expect(keyboard.update(0)).toEqual(["left-press"]);
    expect(keyboard.update(166)).toEqual([]);
    expect(keyboard.update(167)).toEqual(["left-held"]);
  });

  it("repeats every 33ms for 11 held intents by t=500", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    keyboard.update(0);
    let held: number = 0;
    for (let t: number = 1; t <= 500; t++) {
      const intents = keyboard.update(t);
      for (const intent of intents) {
        if (intent === "left-held") {
          held++;
        }
      }
    }
    expect(held).toBe(11);
  });

  it("mirrors right-direction timing", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowRight", 100);
    expect(keyboard.update(100)).toEqual(["right-press"]);
    expect(keyboard.update(266)).toEqual([]);
    expect(keyboard.update(267)).toEqual(["right-held"]);
  });
});

describe("keyboard repeat guard and release", (): void => {
  it("ignores OS auto-repeat downs", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    expect(keyboard.update(0)).toEqual(["left-press"]);
    keyboard.down("ArrowLeft", 10, true);
    keyboard.down("ArrowLeft", 20, true);
    expect(keyboard.update(20)).toEqual([]);
  });

  it("ignores duplicate downs without release", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    keyboard.down("ArrowLeft", 5);
    expect(keyboard.update(5)).toEqual(["left-press"]);
  });

  it("stops repeats after release", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    keyboard.update(0);
    expect(keyboard.update(167)).toEqual(["left-held"]);
    keyboard.up("ArrowLeft", 200);
    expect(keyboard.isHeld("left")).toBe(false);
    expect(keyboard.update(500)).toEqual([]);
  });

  it("clear empties the queue and releases held keys", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    keyboard.down("ArrowDown", 0);
    keyboard.clear();
    expect(keyboard.isHeld("left")).toBe(false);
    expect(keyboard.isHeld("softdrop")).toBe(false);
    expect(keyboard.update(1000)).toEqual([]);
  });
});

describe("keyboard code map", (): void => {
  it("maps discrete codes to intents", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("KeyZ", 0);
    keyboard.down("KeyX", 0);
    keyboard.down("ArrowUp", 0);
    keyboard.down("Space", 0);
    keyboard.down("KeyC", 0);
    keyboard.down("Escape", 0);
    keyboard.down("KeyR", 0);
    keyboard.down("KeyM", 0);
    expect(keyboard.update(0)).toEqual([
      "rotate-ccw",
      "rotate-cw",
      "rotate-cw",
      "hard-drop",
      "hold",
      "pause",
      "restart",
      "mute",
    ]);
  });

  it("tracks ArrowDown as softdrop held state", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowDown", 0);
    expect(keyboard.isHeld("softdrop")).toBe(true);
    expect(keyboard.update(0)).toEqual([]);
    keyboard.up("ArrowDown");
    expect(keyboard.isHeld("softdrop")).toBe(false);
  });
});

describe("keyboard last-pressed direction wins", (): void => {
  it("repeats only the newest direction and resumes on release", (): void => {
    const keyboard = createKeyboard();
    keyboard.down("ArrowLeft", 0);
    expect(keyboard.update(0)).toEqual(["left-press"]);
    keyboard.down("ArrowRight", 50);
    expect(keyboard.update(50)).toEqual(["right-press"]);
    expect(keyboard.update(217)).toEqual(["right-held"]);
    expect(keyboard.isHeld("left")).toBe(true);
    expect(keyboard.isHeld("right")).toBe(true);
    keyboard.up("ArrowRight", 300);
    expect(keyboard.isHeld("left")).toBe(true);
    expect(keyboard.isHeld("right")).toBe(false);
    const resumed = keyboard.update(467);
    expect(resumed).toEqual(["left-held"]);
  });
});

describe("keyboard constants parity", (): void => {
  it("matches the canonical tuning table", (): void => {
    expect(DAS_MS).toBe(CORE_DAS_MS);
    expect(ARR_MS).toBe(CORE_ARR_MS);
    expect(DAS_MS).toBe(167);
    expect(ARR_MS).toBe(33);
  });
});
