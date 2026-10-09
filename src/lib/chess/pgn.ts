import { Chess, DEFAULT_POSITION, type Move } from "chess.js";
import type { Game, MoveNode, PgnSideLine } from "./types";

export class PgnError extends Error {}

export function toNode(m: Move, ply: number, comment?: string): MoveNode {
  const fullmove = Number(m.before.split(" ")[5] ?? 1);
  return {
    ply,
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ""),
    from: m.from,
    to: m.to,
    promotion: m.promotion,
    piece: m.piece,
    captured: m.captured,
    color: m.color,
    moveNumber: fullmove,
    fenBefore: m.before,
    fenAfter: m.after,
    comment,
  };
}

function tokenize(movetext: string): string[] {
  const re = /\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|\d+\.(\.\.)?|1-0|0-1|1\/2-1\/2|\*|[^\s(){};]+/g;
  return movetext.match(re) ?? [];
}

function isSanToken(t: string) {
  return !/^(\{|;|\$|\d+\.|1-0|0-1|1\/2-1\/2|\*)/.test(t) && t !== "(" && t !== ")";
}

function cleanSan(t: string) {
  return t.replace(/[!?]+$/, "").replace(/^\d+\.+/, "");
}

/** Extract first-level side lines (RAVs). Nested sub-variations are skipped. */
function extractSideLines(movetext: string, mainline: MoveNode[]): PgnSideLine[] {
  const tokens = tokenize(movetext);
  const out: PgnSideLine[] = [];
  let k = 0;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "(") {
      let depth = 1;
      const inner: string[] = [];
      i++;
      while (i < tokens.length && depth > 0) {
        if (tokens[i] === "(") depth++;
        else if (tokens[i] === ")") depth--;
        else if (depth === 1 && isSanToken(tokens[i])) inner.push(cleanSan(tokens[i]));
        i++;
      }
      const branchPly = k - 1;
      const base = mainline[branchPly];
      if (base && inner.length) {
        const c = new Chess(base.fenBefore);
        const moves: MoveNode[] = [];
        for (const s of inner) {
          try {
            moves.push(toNode(c.move(s), moves.length));
          } catch {
            break;
          }
        }
        if (moves.length) out.push({ branchPly, moves });
      }
      continue;
    }
    if (isSanToken(t)) k++;
    i++;
  }
  return out;
}

export function parsePgn(text: string): Game {
  const src = text.replace(/\r/g, "").trim();
  if (!src) throw new PgnError("The PGN is empty.");
  const chess = new Chess();
  try {
    chess.loadPgn(src);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PgnError(`Invalid PGN: ${msg.split("\n")[0]}`);
  }
  const headers = chess.getHeaders();
  const history = chess.history({ verbose: true });
  if (!history.length && !headers["FEN"]) throw new PgnError("No moves were found in this PGN.");

  const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
  const moves = history.map((m, i) => toNode(m, i, comments.get(m.after)));
  const startFen = history[0]?.before ?? headers["FEN"] ?? DEFAULT_POSITION;

  const movetext = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("["))
    .join("\n");
  let sideLines: PgnSideLine[] = [];
  try {
    sideLines = extractSideLines(movetext, moves);
  } catch {
    sideLines = [];
  }

  const clean = (v?: string) => (v && v !== "?" && !/^\?+[.?]*$/.test(v) ? v : undefined);
  return {
    meta: {
      white: clean(headers["White"]) ?? "White",
      black: clean(headers["Black"]) ?? "Black",
      whiteElo: clean(headers["WhiteElo"]),
      blackElo: clean(headers["BlackElo"]),
      event: clean(headers["Event"]),
      site: clean(headers["Site"]),
      date: clean(headers["Date"]),
      result: headers["Result"] ?? "*",
    },
    startFen,
    moves,
    sideLines,
    startComment: comments.get(startFen),
  };
}

export const SAMPLE_PGN = `[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8
13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;
