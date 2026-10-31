import { beforeEach, describe, expect, it } from "vitest";
import {
  GAME_OVER_TEXT,
  PAUSED_TEXT,
  overlayTextFor,
  resetOverlayCache,
  syncOverlay,
} from "./overlay";
import type { OverlayState } from "./overlay";

/** Minimal structural fake element: no DOM library, write-counted. */
class FakeElement {
  public textContent: string | null = null;
  public hidden: boolean = false;
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public className: string = "";
  public id: string = "";
  public children: FakeElement[] = [];
  public writes: number = 0;

  public appendChild(child: FakeElement): void {
    this.children.push(child);
    this.writes += 1;
  }

  public replaceChildren(...kids: FakeElement[]): void {
    this.children = [...kids];
    this.writes += 1;
  }

  public removeChild(child: FakeElement): void {
    this.children = this.children.filter(
      (entry: FakeElement): boolean => entry !== child,
    );
    this.writes += 1;
  }

  public get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  public querySelector(selector: string): FakeElement | null {
    if (selector === "#overlay-summary") {
      for (const child of this.children) {
        if (child.id === "overlay-summary") {
          return child;
        }
      }
      return null;
    }
    return null;
  }
}

/** Cast a fake into the overlay helpers' element type. */
function asEl(fake: FakeElement): HTMLElement {
  return fake as unknown as HTMLElement;
}

/** Find the summary child of a fake host. */
function summaryOf(host: FakeElement): FakeElement | null {
  for (const child of host.children) {
    if (child.id === "overlay-summary") {
      return child;
    }
  }
  return null;
}

beforeEach((): void => {
  resetOverlayCache();
});

describe("overlayTextFor", (): void => {
  it("maps paused and gameover to their exact banners", (): void => {
    expect(overlayTextFor("paused")).toBe(PAUSED_TEXT);
    expect(overlayTextFor("paused")).toBe("PAUSED");
    expect(overlayTextFor("gameover")).toBe(GAME_OVER_TEXT);
    expect(overlayTextFor("gameover")).toBe("GAME OVER");
  });

  it("returns null for menu and playing", (): void => {
    expect(overlayTextFor("menu")).toBeNull();
    expect(overlayTextFor("playing")).toBeNull();
  });
});

describe("syncOverlay", (): void => {
  it("shows the exact PAUSED banner unhidden", (): void => {
    const host = new FakeElement();
    syncOverlay(asEl(host), "paused");
    expect(host.hidden).toBe(false);
    expect(host.style.display).toBe("flex");
    expect(host.textContent).toBe("PAUSED");
    expect(host.textContent).toContain(PAUSED_TEXT);
  });

  it("shows GAME OVER with the summary hook", (): void => {
    const host = new FakeElement();
    syncOverlay(asEl(host), "gameover", "Score 10 · Lines 2");
    expect(host.hidden).toBe(false);
    expect(host.style.display).toBe("flex");
    expect(host.textContent).toContain("GAME OVER");
    const summary: FakeElement | null = summaryOf(host);
    expect(summary).not.toBeNull();
    expect((summary as FakeElement).textContent).toBe("Score 10 · Lines 2");
  });

  it("hides and clears for playing and menu", (): void => {
    for (const state of ["playing", "menu"] as OverlayState[]) {
      resetOverlayCache();
      const host = new FakeElement();
      syncOverlay(asEl(host), "paused");
      expect(host.hidden).toBe(false);
      syncOverlay(asEl(host), state);
      expect(host.hidden).toBe(true);
      expect(host.style.display).toBe("none");
      expect(host.textContent).toBe("");
      expect(host.children.length).toBe(0);
    }
  });

  it("performs no DOM writes when re-synced with identical state", (): void => {
    const host = new FakeElement();
    syncOverlay(asEl(host), "gameover", "Score 10 · Lines 2");
    const writes: number = host.writes;
    expect(writes).toBeGreaterThan(0);
    syncOverlay(asEl(host), "gameover", "Score 10 · Lines 2");
    expect(host.writes).toBe(writes);
  });

  it("is a no-op for a null host", (): void => {
    expect((): void => syncOverlay(null, "paused")).not.toThrow();
    expect((): void => syncOverlay(null, "gameover", "Score 0 · Lines 0")).not.toThrow();
    expect((): void => syncOverlay(null, "playing")).not.toThrow();
  });
});
