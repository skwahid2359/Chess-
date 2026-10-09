import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { classifyMove } from "@/lib/chess/classify";
import { toNode } from "@/lib/chess/pgn";
import type { EngineResult } from "@/lib/chess/types";

const c = new Chess();
const m = toNode(c.move("a4"), 0);
const res = (fen: string, cp: number, pv = "e2e4"): EngineResult => ({
  fen,
  depth: 14,
  lines: [{ multipv: 1, depth: 14, score: { cp }, pv: [pv] }],
});
const cls = (afterCp: number) =>
  classifyMove(m, res(m.fenBefore, 0), null, res(m.fenAfter, afterCp, "e7e5"), null, false)!
    .classification;

describe("classification bands (win-% points lost)", () => {
  it("~7 points lost is an inaccuracy", () => expect(cls(-80)).toBe("inaccuracy"));
  it("~13 points lost is a mistake", () => expect(cls(-150)).toBe("mistake"));
  it("~25 points lost is a blunder", () => expect(cls(-320)).toBe("blunder"));
});

describe("miss (failed to punish)", () => {
  it("losing 7 points right after opponent gifted 15 is a Miss", () => {
    const r = classifyMove(m, res(m.fenBefore, 0), null, res(m.fenAfter, -80, "e7e5"), null, false, { cp: -300 })!;
    expect(r.classification).toBe("missed-win");
  });
});
