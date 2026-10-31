import { describe, expect, it } from "vitest";
import { STEP_MS, shouldPreventDefault, stepAccumulator } from "./main";

describe("stepAccumulator", (): void => {
  it("slices 33.34ms into exactly two fixed steps with remainder below STEP_MS", (): void => {
    const result = stepAccumulator(33.34);
    expect(result.steps).toBe(2);
    expect(result.remainder).toBeLessThan(STEP_MS);
    expect(result.remainder).toBeGreaterThanOrEqual(0);
  });

  it("yields zero steps for sub-step input", (): void => {
    const result = stepAccumulator(STEP_MS / 2);
    expect(result.steps).toBe(0);
    expect(result.remainder).toBeCloseTo(STEP_MS / 2, 10);
  });
});

describe("shouldPreventDefault", (): void => {
  it("blocks all four arrows and every Space form", (): void => {
    expect(shouldPreventDefault("ArrowLeft", "ArrowLeft")).toBe(true);
    expect(shouldPreventDefault("ArrowRight", "ArrowRight")).toBe(true);
    expect(shouldPreventDefault("ArrowUp", "ArrowUp")).toBe(true);
    expect(shouldPreventDefault("ArrowDown", "ArrowDown")).toBe(true);
    expect(shouldPreventDefault(" ", "Space")).toBe(true);
    expect(shouldPreventDefault("Spacebar", "Space")).toBe(true);
    expect(shouldPreventDefault("x", "Space")).toBe(true);
  });

  it("leaves ordinary keys alone", (): void => {
    expect(shouldPreventDefault("a", "KeyA")).toBe(false);
    expect(shouldPreventDefault("Enter", "Enter")).toBe(false);
  });
});

describe("STEP_MS", (): void => {
  it("is exactly one 1000/60ms slice", (): void => {
    expect(STEP_MS).toBe(1000 / 60);
  });
});
