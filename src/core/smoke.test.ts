// Placeholder smoke test: keeps the suite green until real core tests land.
import { describe, expect, it } from "vitest";

describe("smoke", (): void => {
  it("placeholder keeps the suite green", (): void => {
    expect(1 + 1).toBe(2);
  });
});
