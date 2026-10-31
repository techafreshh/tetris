import { beforeEach, describe, expect, it } from "vitest";
import { createGame } from "../core/game";
import type { PieceKind } from "../core/pieces";
import {
  NEXT_COUNT,
  resetPanelsCache,
  syncEventText,
  syncHold,
  syncNext,
  syncPanels,
  syncStats,
} from "./panels";
import type { PanelData } from "./panels";

/** Minimal structural fake element: no DOM library, write-counted. */
class FakeElement {
  public textContent: string | null = null;
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public className: string = "";
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
    this.children = this.children.filter((entry: FakeElement): boolean => entry !== child);
    this.writes += 1;
  }

  public get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
}

/** Cast a fake into the sync helpers' element type. */
function asEl(fake: FakeElement): HTMLElement {
  return fake as unknown as HTMLElement;
}

/** Read displayed piece identities in order. */
function kindsOf(host: FakeElement): string[] {
  return host.children.map((child: FakeElement): string => child.dataset.kind);
}

/** Sum DOM writes across fake panel nodes. */
function totalWrites(nodes: FakeElement[]): number {
  return nodes.reduce((sum: number, node: FakeElement): number => sum + node.writes, 0);
}

const QUEUE: PieceKind[] = ["T", "I", "O", "S", "Z", "J", "L"];

beforeEach((): void => {
  resetPanelsCache();
});

describe("syncNext", (): void => {
  it("renders exactly 5 children in input order", (): void => {
    const host = new FakeElement();
    syncNext(asEl(host), QUEUE);
    expect(host.children.length).toBe(NEXT_COUNT);
    expect(host.children.length).toBe(5);
    expect(kindsOf(host)).toEqual(["T", "I", "O", "S", "Z"]);
  });

  it("advances the first child when the queue shifts by 2", (): void => {
    const host = new FakeElement();
    syncNext(asEl(host), QUEUE);
    expect(kindsOf(host)[0]).toBe("T");
    const shifted: PieceKind[] = [...QUEUE.slice(2), "T", "I"];
    syncNext(asEl(host), shifted);
    expect(host.children.length).toBe(5);
    expect(kindsOf(host)).toEqual(["O", "S", "Z", "J", "L"]);
    expect(kindsOf(host)[0]).toBe(QUEUE[2]);
  });

  it("matches the core next array across two hard drops", (): void => {
    const game = createGame(0);
    const host = new FakeElement();
    syncNext(asEl(host), game.next);
    expect(kindsOf(host)).toEqual(game.next);
    game.hardDrop();
    game.hardDrop();
    syncNext(asEl(host), game.next);
    expect(host.children.length).toBe(5);
    expect(kindsOf(host)).toEqual(game.next);
  });

  it("performs no DOM writes when re-synced with identical data", (): void => {
    const host = new FakeElement();
    syncNext(asEl(host), QUEUE);
    const writes: number = host.writes;
    expect(writes).toBeGreaterThan(0);
    syncNext(asEl(host), QUEUE);
    expect(host.writes).toBe(writes);
  });
});

describe("syncHold", (): void => {
  it("holds zero children when empty", (): void => {
    const host = new FakeElement();
    syncHold(asEl(host), null);
    expect(host.children.length).toBe(0);
  });

  it("holds one matching child when filled", (): void => {
    const host = new FakeElement();
    syncHold(asEl(host), "T");
    expect(host.children.length).toBe(1);
    expect(host.children[0].dataset.kind).toBe("T");
    expect(host.children[0].textContent).toBe("T");
  });

  it("returns to zero children after the hold clears", (): void => {
    const host = new FakeElement();
    syncHold(asEl(host), "L");
    expect(host.children.length).toBe(1);
    syncHold(asEl(host), null);
    expect(host.children.length).toBe(0);
  });
});

describe("syncStats", (): void => {
  it("writes pure numeric text", (): void => {
    const score = new FakeElement();
    const lines = new FakeElement();
    const level = new FakeElement();
    syncStats(asEl(score), asEl(lines), asEl(level), 24, 3, 2);
    expect(score.textContent).toBe("24");
    expect(lines.textContent).toBe("3");
    expect(level.textContent).toBe("2");
    for (const node of [score, lines, level]) {
      expect(node.textContent).toMatch(/^\d+$/);
    }
  });
});

describe("syncPanels", (): void => {
  it("syncs hold, queue, and stats from one snapshot", (): void => {
    const hold = new FakeElement();
    const queue = new FakeElement();
    const score = new FakeElement();
    const lines = new FakeElement();
    const level = new FakeElement();
    const data: PanelData = {
      held: "Z",
      next: QUEUE,
      score: 8,
      lines: 0,
      level: 1,
    };
    syncPanels(asEl(hold), asEl(queue), asEl(score), asEl(lines), asEl(level), data);
    expect(hold.children.length).toBe(1);
    expect(queue.children.length).toBe(5);
    expect(kindsOf(queue)).toEqual(["T", "I", "O", "S", "Z"]);
    expect(score.textContent).toBe("8");
  });

  it("performs no DOM writes when re-synced with identical data", (): void => {
    const nodes: FakeElement[] = [
      new FakeElement(),
      new FakeElement(),
      new FakeElement(),
      new FakeElement(),
      new FakeElement(),
    ];
    const data: PanelData = {
      held: null,
      next: QUEUE,
      score: 0,
      lines: 0,
      level: 1,
    };
    syncPanels(asEl(nodes[0]), asEl(nodes[1]), asEl(nodes[2]), asEl(nodes[3]), asEl(nodes[4]), data);
    expect(totalWrites(nodes)).toBeGreaterThan(0);
    const writes: number = totalWrites(nodes);
    syncPanels(asEl(nodes[0]), asEl(nodes[1]), asEl(nodes[2]), asEl(nodes[3]), asEl(nodes[4]), data);
    expect(totalWrites(nodes)).toBe(writes);
  });
});

describe("syncEventText", (): void => {
  it("writes text into an empty node", (): void => {
    const host = new FakeElement();
    syncEventText(asEl(host), "TETRIS!");
    expect(host.textContent).toBe("TETRIS!");
  });

  it("performs no additional write on identical re-sync", (): void => {
    const host = new FakeElement();
    const node = asEl(host);
    let stored: string | null = null;
    let sets: number = 0;
    Object.defineProperty(node, "textContent", {
      configurable: true,
      get(): string | null {
        return stored;
      },
      set(value: string | null) {
        sets += 1;
        stored = value;
      },
    });
    syncEventText(node, "COMBO x1");
    expect(stored).toBe("COMBO x1");
    expect(sets).toBe(1);
    syncEventText(node, "COMBO x1");
    expect(sets).toBe(1);
  });

  it("updates on changed text", (): void => {
    const host = new FakeElement();
    syncEventText(asEl(host), "SINGLE");
    expect(host.textContent).toBe("SINGLE");
    syncEventText(asEl(host), "BACK-TO-BACK TETRIS!");
    expect(host.textContent).toBe("BACK-TO-BACK TETRIS!");
  });

  it("ignores a null node", (): void => {
    syncEventText(null, "TETRIS!");
    expect(true).toBe(true);
  });
});
