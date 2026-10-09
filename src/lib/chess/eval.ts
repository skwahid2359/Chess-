import { Chess } from "chess.js";
import type { Score } from "./types";

/** Win probability for White (0-100), using the logistic model popularised by Lichess. */
export function winPct(s: Score): number {
  if (s.terminal) return s.terminal === "w" ? 100 : s.terminal === "b" ? 0 : 50;
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function moverWin(s: Score, color: "w" | "b") {
  const w = winPct(s);
  return color === "w" ? w : 100 - w;
}

/** Per-move accuracy from win-% loss (Lichess-style curve). */
export function moveAccuracy(loss: number) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

export function formatScore(s: Score | undefined): string {
  if (!s) return "–";
  if (s.terminal) return s.terminal === "w" ? "1-0" : s.terminal === "b" ? "0-1" : "½-½";
  if (s.mate !== undefined) return (s.mate < 0 ? "-M" : "M") + Math.abs(s.mate);
  const v = (s.cp ?? 0) / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

/** Score for positions where the game is over (no engine needed). */
export function terminalScore(fen: string): Score | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { terminal: c.turn() === "w" ? "b" : "w" };
  if (c.isDraw() || c.isStalemate()) return { terminal: "draw" };
  return null;
}

export function uciToSanLine(fen: string, uci: string[], max = 12): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const m of uci.slice(0, max)) {
    try {
      const mv = c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      out.push(mv.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Formats a SAN line with move numbers, starting from the given FEN. */
export function numberLine(fen: string, sans: string[]): string {
  const parts = fen.split(" ");
  let num = Number(parts[5] ?? 1);
  let white = parts[1] === "w";
  return sans
    .map((s, i) => {
      let p = "";
      if (white) p = `${num}. `;
      else if (i === 0) p = `${num}… `;
      const r = p + s;
      if (!white) num++;
      white = !white;
      return r;
    })
    .join(" ");
}
