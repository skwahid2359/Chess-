import { Chess, type Square } from "chess.js";
import { formatScore, moveAccuracy, moverWin, uciToSanLine } from "./eval";
import type { Classification, EngineResult, MoveNode, MoveReview, Score } from "./types";

/**
 * Move classification, modelled on chess.com's "Classification V2".
 * Main idea: measure how many win-% points the mover gave up versus the engine's best move.
 * Special labels (Brilliant, Great, Miss, Book, Forced) use extra rules on top of that.
 */
export const THRESHOLDS = {
  // Expected-points bands for the loss (win-% points), per chess.com's published cutoffs.
  excellent: 2, // loss < 2  -> Excellent (almost as good as the best move)
  good: 5, // loss < 5  -> Good
  inaccuracy: 5, // loss 5-10 -> Inaccuracy
  mistake: 10, // loss 10-20 -> Mistake
  blunder: 20, // loss >= 20 -> Blunder

  // Great-move rules.
  greatGap: 10, // "only move": 2nd-best line must be this much worse
  losingBelow: 40, // "losing → equal": position was below this for the mover...
  equalAbove: 45, // ...and is at least this after the move
  equalFrom: 40, // "equal → winning": position was between equalFrom and equalTo...
  equalTo: 60,
  winningAt: 75, // ...and is at least this after the move
  punishGift: 10, // opponent's previous move gave away this many win-% points

  // Brilliant rules.
  brilliantGap: 5, // best move must beat 2nd-best by this many win-% points
  brilliantMinSac: 1, // net material (pawn units) the move leaves en prise
  brilliantMaxLoss: 1.5, // near-zero loss vs. engine best
};

export const CLASS_INFO: Record<Classification, { label: string; symbol: string }> = {
  brilliant: { label: "Brilliant", symbol: "!!" },
  great: { label: "Great", symbol: "!" },
  best: { label: "Best", symbol: "★" },
  excellent: { label: "Excellent", symbol: "✓" },
  good: { label: "Good", symbol: "○" },
  book: { label: "Book", symbol: "≡" },
  forced: { label: "Forced", symbol: "•" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!" },
  mistake: { label: "Mistake", symbol: "?" },
  blunder: { label: "Blunder", symbol: "??" },
  "missed-win": { label: "Miss", symbol: "✗" },
};

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** Did the move leave the moved piece en prise for a net material loss? */
function sacrifice(m: MoveNode): { piece: string } | null {
  if (m.piece === "k" || m.promotion) return null;
  const c = new Chess(m.fenAfter);
  const to = m.to as Square;
  const opp = m.color === "w" ? "b" : "w";
  const attackers = c.attackers(to, opp);
  if (!attackers.length) return null;
  const defenders = c.attackers(to, m.color);
  const v = VALUE[m.piece];
  const gained = m.captured ? VALUE[m.captured] : 0;
  const cheapest = Math.min(...attackers.map((sq) => VALUE[c.get(sq)?.type ?? "k"] || 99));
  // If defended, the opponent only gains by taking with a cheaper piece.
  const net = defenders.length ? Math.min(v - gained, v - cheapest) : v - gained;
  // A lone pawn push left en prise is too common to count as a sacrifice.
  if (m.piece === "p" && !defenders.length && net < 2 && !m.captured) {
    const pawnAttackers = attackers.filter((sq) => c.get(sq)?.type === "p");
    if (!pawnAttackers.length) return null;
  }
  return net >= THRESHOLDS.brilliantMinSac ? { piece: NAME[m.piece] } : null;
}

/** Number of legal moves in a position. A count of 1 means the move was forced. */
function legalMoveCount(fen: string): number {
  try {
    return new Chess(fen).moves().length;
  } catch {
    return 0;
  }
}

function bestScore(r?: EngineResult | null, term?: Score | null): Score | undefined {
  return term ?? r?.lines[0]?.score;
}

function sanOf(fen: string, uci?: string) {
  return uci ? uciToSanLine(fen, [uci], 1)[0] : undefined;
}

export function classifyMove(
  m: MoveNode,
  before: EngineResult | null,
  beforeTerm: Score | null,
  after: EngineResult | null,
  afterTerm: Score | null,
  isBook: boolean,
  prevScore?: Score | null,
): MoveReview | null {
  const sb = bestScore(before, beforeTerm);
  const sa = bestScore(after, afterTerm);
  if (!sb || !sa || !before) return null;

  const wb = moverWin(sb, m.color); // mover's win-% before the move
  const wa = moverWin(sa, m.color); // mover's win-% after the move
  const loss = Math.max(0, wb - wa);
  const bestUci = before.lines[0]?.pv[0];
  const isBest = bestUci === m.uci || afterTerm?.terminal === m.color;
  const bestPvSan = uciToSanLine(m.fenBefore, before.lines[0]?.pv ?? [], 8);
  const bestSan = bestPvSan[0];
  const second = before.lines[1];
  const secondGap = second ? wa - moverWin(second.score, m.color) : 0;
  // How much the opponent's previous move handed to the mover (chess.com's "Miss" idea).
  const gift = prevScore ? Math.max(0, wb - moverWin(prevScore, m.color)) : 0;
  const s2 = second ? sanOf(m.fenBefore, second.pv[0]) : undefined;

  let cls: Classification;
  let explanation: string | undefined;

  if (isBook && loss < THRESHOLDS.inaccuracy) {
    cls = "book";
  } else if (legalMoveCount(m.fenBefore) === 1) {
    // Only one legal move existed: nothing to grade (chess.com shows this as "Forced").
    cls = "forced";
  } else if (wb >= 85 && wa >= 35 && wa <= 65 && !isBest) {
    cls = "missed-win";
  } else if (gift >= THRESHOLDS.punishGift && loss >= THRESHOLDS.inaccuracy && loss < THRESHOLDS.blunder) {
    cls = "missed-win"; // failed to punish the opponent's error
  } else if (loss >= THRESHOLDS.blunder) cls = "blunder";
  else if (loss >= THRESHOLDS.mistake) cls = "mistake";
  else if (loss >= THRESHOLDS.inaccuracy) cls = "inaccuracy";
  else if (isBest) {
    cls = "best";
    const sac = sacrifice(m);

    // Brilliant: a real piece sacrifice that is the engine's top move AND clearly better than the
    // 2nd-best line AND leaves the mover not losing. All conditions must hold.
    const isBrilliant =
      sac &&
      sac.piece !== "pawn" &&
      second &&
      loss <= THRESHOLDS.brilliantMaxLoss &&
      wa >= 45 &&
      wb < 92 &&
      wa <= 97 &&
      secondGap >= THRESHOLDS.brilliantGap;

    // Great: the only good move, OR it turns a losing position into an equal one,
    // OR it turns an equal position into a winning one.
    const onlyMove = second && secondGap >= THRESHOLDS.greatGap && wb < 95 && wa >= THRESHOLDS.equalFrom;
    const losingToEqual = wb < THRESHOLDS.losingBelow && wa >= THRESHOLDS.equalAbove;
    const equalToWinning =
      wb >= THRESHOLDS.equalFrom && wb <= THRESHOLDS.equalTo && wa >= THRESHOLDS.winningAt;
    const punishesError = second && gift >= THRESHOLDS.punishGift && secondGap >= 5 && wb < 95;

    if (isBrilliant) {
      cls = "brilliant";
      explanation = `${m.san} sacrifices the ${sac!.piece}, yet the engine's best line keeps the evaluation at ${fmtA(sa)}. The next-best option${s2 ? ` (${s2})` : ""} scores only ${formatScore(second!.score)}, so the sacrifice is the clearly strongest resource.`;
    } else if (losingToEqual) {
      cls = "great";
      explanation = `${m.san} turns a losing position (${formatScore(sb)}) into an equal one (${fmtA(sa)}).`;
    } else if (equalToWinning) {
      cls = "great";
      explanation = `${m.san} turns an equal position into a winning one (${fmtA(sa)}).`;
    } else if (onlyMove) {
      cls = "great";
      explanation = `Only move that holds the evaluation: the next-best option${s2 ? ` (${s2})` : ""} scores ${formatScore(second!.score)} instead of ${fmtA(sa)}.`;
    } else if (punishesError) {
      cls = "great";
      explanation = `Punishes the opponent's error: the next-best option${s2 ? ` (${s2})` : ""} scores only ${formatScore(second!.score)}.`;
    }
  } else if (loss < THRESHOLDS.excellent) cls = "excellent";
  else cls = "good";

  if (["inaccuracy", "mistake", "blunder", "missed-win"].includes(cls)) {
    explanation = explainError(m, before, after, sa, bestSan);
  }

  return {
    ply: m.ply,
    classification: cls,
    winLoss: loss,
    accuracy: moveAccuracy(loss),
    before: sb,
    after: sa,
    bestUci,
    bestSan,
    bestPvSan,
    explanation,
  };
}

/** Formats the mover-independent evaluation for explanation text. */
function fmtA(s: Score) {
  return formatScore(s);
}

function explainError(
  m: MoveNode,
  before: EngineResult,
  after: EngineResult | null,
  sa: Score,
  bestSan?: string,
): string {
  const parts: string[] = [];
  const opp = m.color === "w" ? "b" : "w";
  const oppMates = sa.mate !== undefined && (opp === "w" ? sa.mate > 0 : sa.mate < 0);
  const reply = after?.lines[0]?.pv[0];
  if (oppMates) {
    const replySan = sanOf(m.fenAfter, reply);
    parts.push(
      `Allows a forced mate in ${Math.abs(sa.mate!)}${replySan ? `, starting with ${replySan}` : ""}.`,
    );
  } else if (reply) {
    const c = new Chess(m.fenAfter);
    try {
      const r = c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
      if (r.captured) parts.push(`Allows ${r.san}, winning the ${NAME[r.captured]} on ${r.to}.`);
      else if (r.san.includes("+")) parts.push(`Allows ${r.san} with check.`);
      else parts.push(`The engine's strongest reply is ${r.san}.`);
    } catch {
      /* ignore: engine line did not replay cleanly */
    }
  }
  const bs = before.lines[0]?.score;
  const bestMates = bs?.mate !== undefined && (m.color === "w" ? bs.mate > 0 : bs.mate < 0);
  if (bestSan) {
    const c = new Chess(m.fenBefore);
    let cap: string | undefined;
    try {
      cap = c.move(bestSan).captured;
    } catch {
      /* ignore */
    }
    if (bestMates) parts.push(`${bestSan} had a forced mate in ${Math.abs(bs!.mate!)}.`);
    else if (cap) parts.push(`${bestSan} was stronger, capturing the ${NAME[cap]}.`);
    else parts.push(`${bestSan} was the engine's choice.`);
  }
  return parts.join(" ");
}

export interface ReviewSummary {
  accuracy: { w: number; b: number } | null;
  counts: Record<"w" | "b", Partial<Record<Classification, number>>>;
}

export function summarize(reviews: (MoveReview | null)[], moves: MoveNode[]): ReviewSummary {
  const counts: ReviewSummary["counts"] = { w: {}, b: {} };
  const acc = { w: [] as number[], b: [] as number[] };
  reviews.forEach((r, i) => {
    // Forced moves have nothing to grade, so they do not affect accuracy.
    if (!r) return;
    const c = moves[i].color;
    counts[c][r.classification] = (counts[c][r.classification] ?? 0) + 1;
    if (r.classification !== "forced") acc[c].push(r.accuracy);
  });
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const w = mean(acc.w);
  const b = mean(acc.b);
  return { accuracy: isNaN(w) && isNaN(b) ? null : { w, b }, counts };
}
