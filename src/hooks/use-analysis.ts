import { Chess, DEFAULT_POSITION } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyMove, summarize } from "@/lib/chess/classify";
import { UciEngine } from "@/lib/chess/engine";
import { terminalScore } from "@/lib/chess/eval";
import { identifyOpening } from "@/lib/chess/openings";
import { toNode } from "@/lib/chess/pgn";
import type {
  EngineResult,
  EngineStatus,
  Game,
  MoveNode,
  MoveReview,
  Score,
  Variation,
} from "@/lib/chess/types";

export const LIVE_DEPTH = 18;
export const REVIEW_DEPTH = 14;

export interface LiveAnalysis {
  fen: string;
  result: EngineResult | null;
  terminal: Score | null;
  done: boolean;
}

export function useAnalysis() {
  const [game, setGame] = useState<Game | null>(null);
  const [ply, setPly] = useState(0);
  const [variation, setVariation] = useState<Variation | null>(null);
  const [varPos, setVarPos] = useState(0);
  const [playing, setPlaying] = useState(false);

  const liveEngine = useRef<UciEngine | null>(null);
  const reviewEngine = useRef<UciEngine | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("starting");
  const [live, setLive] = useState<LiveAnalysis | null>(null);
  const [reviewResults, setReviewResults] = useState<(EngineResult | null)[]>([]);
  const [reviewProgress, setReviewProgress] = useState<{
    done: number;
    total: number;
    running: boolean;
  }>({
    done: 0,
    total: 0,
    running: false,
  });

  useEffect(() => {
    const le = new UciEngine();
    const re = new UciEngine();
    liveEngine.current = le;
    reviewEngine.current = re;
    const off = le.onStatus(setEngineStatus);
    return () => {
      off();
      le.destroy();
      re.destroy();
    };
  }, []);

  const mainline: MoveNode[] = useMemo(() => game?.moves ?? [], [game]);
  const startFen = game?.startFen ?? DEFAULT_POSITION;
  const inVariation = !!variation && varPos > 0;

  const mainFen = useCallback(
    (p: number) => (p === 0 ? startFen : mainline[p - 1].fenAfter),
    [mainline, startFen],
  );

  const currentNode: MoveNode | null = inVariation
    ? variation!.moves[varPos - 1]
    : ply > 0
      ? mainline[ply - 1]
      : null;
  const currentFen = currentNode
    ? currentNode.fenAfter
    : mainFen(variation ? variation.fromPly : ply);

  // ----- Live engine on current position -----
  useEffect(() => {
    const eng = liveEngine.current;
    if (!eng) return;
    const term = terminalScore(currentFen);
    if (term) {
      eng.cancel();
      setLive({ fen: currentFen, result: null, terminal: term, done: true });
      return;
    }
    setLive({ fen: currentFen, result: null, terminal: null, done: false });
    let lastPush = 0;
    let alive = true;
    eng
      .analyze(currentFen, LIVE_DEPTH, 1, (r) => {
        const now = performance.now();
        if (!alive || now - lastPush < 120) return;
        lastPush = now;
        setLive({ fen: currentFen, result: r, terminal: null, done: false });
      })
      .then((r) => {
        if (alive && r) setLive({ fen: currentFen, result: r, terminal: null, done: true });
      });
    return () => {
      alive = false;
    };
  }, [currentFen, engineStatus]);

  // ----- Full-game review (separate engine instance) -----
  useEffect(() => {
    const eng = reviewEngine.current;
    if (!game || !eng) return;
    let cancelled = false;
    const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
    setReviewResults(new Array(fens.length).fill(null));
    setReviewProgress({ done: 0, total: fens.length, running: true });
    (async () => {
      const acc: (EngineResult | null)[] = new Array(fens.length).fill(null);
      for (let i = 0; i < fens.length; i++) {
        if (cancelled) return;
        if (!terminalScore(fens[i])) {
          const r = await eng.analyze(fens[i], REVIEW_DEPTH, 2);
          if (cancelled) return;
          if (!r && eng.status === "failed") {
            setReviewProgress((p) => ({ ...p, running: false }));
            return;
          }
          acc[i] = r;
        }
        setReviewResults([...acc]);
        setReviewProgress({ done: i + 1, total: fens.length, running: i + 1 < fens.length });
      }
    })();
    return () => {
      cancelled = true;
      eng.cancel();
    };
  }, [game]);

  const opening = useMemo(() => identifyOpening(mainline.map((m) => m.san)), [mainline]);

  const reviews: (MoveReview | null)[] = useMemo(() => {
    if (!game) return [];
    return game.moves.map((m, i) => {
      const bTerm = terminalScore(m.fenBefore);
      const aTerm = terminalScore(m.fenAfter);
      const before = reviewResults[i];
      const after = reviewResults[i + 1];
      if (!before || (!after && !aTerm)) return null;
      return classifyMove(m, before, bTerm, after ?? null, aTerm, !!opening && i < opening.plies, i > 0 ? (terminalScore(game.moves[i - 1].fenBefore) ?? reviewResults[i - 1]?.lines[0]?.score) : null);
    });
  }, [game, reviewResults, opening]);

  const summary = useMemo(() => summarize(reviews, mainline), [reviews, mainline]);

  // ----- Navigation -----
  const loadGame = useCallback((g: Game) => {
    setGame(g);
    setPly(0);
    setVariation(null);
    setVarPos(0);
    setPlaying(false);
  }, []);

  const goto = useCallback(
    (p: number) => {
      setVariation(null);
      setVarPos(0);
      setPly(Math.max(0, Math.min(mainline.length, p)));
    },
    [mainline.length],
  );

  const next = useCallback(() => {
    if (variation) {
      setVarPos((v) => Math.min(variation.moves.length, v + 1));
    } else setPly((p) => Math.min(mainline.length, p + 1));
  }, [variation, mainline.length]);

  const prev = useCallback(() => {
    if (variation) {
      if (varPos <= 1) {
        setVariation(null);
        setVarPos(0);
      } else setVarPos(varPos - 1);
    } else setPly((p) => Math.max(0, p - 1));
  }, [variation, varPos]);

  const first = useCallback(() => {
    if (variation) setVarPos(1);
    else setPly(0);
  }, [variation]);

  const last = useCallback(() => {
    if (variation) setVarPos(variation.moves.length);
    else setPly(mainline.length);
  }, [variation, mainline.length]);

  const exitVariation = useCallback(() => {
    if (variation) setPly(variation.fromPly);
    setVariation(null);
    setVarPos(0);
  }, [variation]);

  const enterVariation = useCallback((v: Variation, pos = 1) => {
    setPlaying(false);
    setPly(v.fromPly);
    setVariation(v);
    setVarPos(pos);
  }, []);

  /** Play a move from the current position. Returns false if illegal. */
  const makeMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const c = new Chess(currentFen);
      let mv;
      try {
        mv = c.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        return false;
      }
      setPlaying(false);
      const uci = mv.from + mv.to + (mv.promotion ?? "");
      if (inVariation && variation) {
        if (variation.moves[varPos]?.uci === uci) {
          setVarPos(varPos + 1);
          return true;
        }
        const moves = [...variation.moves.slice(0, varPos), toNode(mv, varPos)];
        setVariation({ fromPly: variation.fromPly, moves });
        setVarPos(moves.length);
        return true;
      }
      const basePly = variation ? variation.fromPly : ply;
      if (mainline[basePly]?.uci === uci) {
        setVariation(null);
        setVarPos(0);
        setPly(basePly + 1);
        return true;
      }
      setPly(basePly);
      setVariation({ fromPly: basePly, moves: [toNode(mv, 0)] });
      setVarPos(1);
      return true;
    },
    [currentFen, inVariation, variation, varPos, ply, mainline],
  );

  const playUci = useCallback(
    (uci: string) => makeMove(uci.slice(0, 2), uci.slice(2, 4), uci[4]),
    [makeMove],
  );

  /**
   * Enter a variation from an explicit pre-move position (e.g. a reviewed move's fenBefore)
   * and play `uci` there. Independent of the current board state, so no stale-closure issues.
   */
  const playFromFen = useCallback(
    (fenBefore: string, uci: string, fromPly?: number): boolean => {
      const base =
        fromPly !== undefined && mainFen(fromPly) === fenBefore
          ? fromPly
          : Array.from({ length: mainline.length + 1 }, (_, i) => i).find(
              (i) => mainFen(i) === fenBefore,
            );
      if (base === undefined) return false;
      const c = new Chess(fenBefore);
      let mv;
      try {
        mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
      } catch {
        return false;
      }
      setPlaying(false);
      const played = mv.from + mv.to + (mv.promotion ?? "");
      if (mainline[base]?.uci === played) {
        setVariation(null);
        setVarPos(0);
        setPly(base + 1);
        return true;
      }
      setPly(base);
      setVariation({ fromPly: base, moves: [toNode(mv, 0)] });
      setVarPos(1);
      return true;
    },
    [mainFen, mainline],
  );

  /** Turn the moves played on the board (game moves up to the branch + variation) into a game and review it. */
  const analyzePlayed = useCallback((): boolean => {
    const base = variation ? mainline.slice(0, variation.fromPly) : mainline.slice(0, ply);
    const extra = variation ? variation.moves : [];
    const all = [...base, ...extra];
    if (!all.length) return false;
    const c = new Chess(startFen);
    const moves: MoveNode[] = [];
    for (const m of all) {
      try {
        moves.push(toNode(c.move({ from: m.from, to: m.to, promotion: m.promotion }), moves.length));
      } catch {
        break;
      }
    }
    const result = c.isCheckmate()
      ? c.turn() === "w"
        ? "0-1"
        : "1-0"
      : c.isDraw()
        ? "1/2-1/2"
        : "*";
    loadGame({
      meta: { white: game?.meta.white ?? "White", black: game?.meta.black ?? "Black", result },
      startFen,
      moves,
      sideLines: [],
    });
    setPly(moves.length);
    return true;
  }, [variation, mainline, ply, startFen, game, loadGame]);

  // ----- Autoplay -----
  useEffect(() => {
    if (!playing) return;
    const atEnd = variation ? varPos >= variation.moves.length : ply >= mainline.length;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(next, 900);
    return () => clearTimeout(t);
  }, [playing, ply, varPos, variation, mainline.length, next]);

  return {
    game,
    loadGame,
    mainline,
    startFen,
    ply,
    variation,
    varPos,
    inVariation,
    currentFen,
    currentNode,
    goto,
    next,
    prev,
    first,
    last,
    playing,
    setPlaying,
    makeMove,
    playUci,
    playFromFen,
    exitVariation,
    analyzePlayed,
    enterVariation,
    engineStatus,
    live,
    reviews,
    reviewResults,
    reviewProgress,
    summary,
    opening,
  };
}

export type AnalysisApi = ReturnType<typeof useAnalysis>;
