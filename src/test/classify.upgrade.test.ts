import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { classifyMove } from "@/lib/chess/classify";
import { identifyOpening } from "@/lib/chess/openings";
import { toNode } from "@/lib/chess/pgn";
import type { EngineResult } from "@/lib/chess/types";

// Helper: fake engine result with one principal variation and a centipawn score.
const res = (fen: string, cp: number, pv: string, extra?: EngineResult["lines"]): EngineResult => ({
  fen,
  depth: 14,
  lines: extra ?? [{ multipv: 1, depth: 14, score: { cp }, pv: [pv] }],
});

describe("forced move", () => {
  it("a move with only one legal option is Forced, not graded", () => {
    // Black's only legal move here is Kg8.
    const c = new Chess("7k/8/6K1/8/8/8/8/6R1 b - - 0 1");
    const m = toNode(c.move("Kg8"), 0);
    const r = classifyMove(m, res(m.fenBefore, 0, "h8g8"), null, res(m.fenAfter, 0, "g1g2"), null, false)!;
    expect(r.classification).toBe("forced");
  });
});

describe("great move: losing to equal", () => {
  it("finding the move that rescues a losing position is Great", () => {
    const c = new Chess();
    const m = toNode(c.move("a4"), 0); // white plays a4 in the start position
    // Before: white is clearly losing (-3.00). The only saving move a4 brings it to equal.
    const before = res(m.fenBefore, -300, "a2a4");
    const after = res(m.fenAfter, 0, "e7e5");
    const r = classifyMove(m, before, null, after, null, false)!;
    expect(r.classification).toBe("great");
    expect(r.explanation).toContain("losing position");
  });
});

describe("opening book", () => {
  it("recognises a long Lichess-book line (Sicilian Najdorf)", () => {
    const seq = "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6".split(" ");
    const hit = identifyOpening(seq);
    expect(hit).not.toBeNull();
    expect(hit!.eco).toMatch(/^B\d\d$/);
  });
});
