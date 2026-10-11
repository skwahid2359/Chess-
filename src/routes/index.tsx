import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board, type BoardArrow } from "@/components/chess/Board";
import { EvalBar } from "@/components/chess/EvalBar";
import { useAnalysis, LIVE_DEPTH, REVIEW_DEPTH, type AnalysisApi } from "@/hooks/use-analysis";
import { CLASS_INFO, THRESHOLDS } from "@/lib/chess/classify";
import { formatScore, numberLine, uciToSanLine } from "@/lib/chess/eval";
import { parsePgn, PgnError, SAMPLE_PGN } from "@/lib/chess/pgn";
import type { Classification, MoveNode, MoveReview } from "@/lib/chess/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Analysis Board — Stockfish PGN Game Review" },
      {
        name: "description",
        content:
          "Import a PGN, replay the game, and review every move with real Stockfish analysis, move classifications and accuracy.",
      },
      { property: "og:title", content: "Analysis Board — Stockfish PGN Game Review" },
      {
        property: "og:description",
        content: "Serious chess game analysis with a real in-browser engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalysisPage,
});

const CLS_TEXT: Record<Classification, string> = {
  brilliant: "text-cls-brilliant",
  great: "text-cls-great",
  best: "text-cls-best",
  excellent: "text-cls-excellent",
  good: "text-cls-good",
  book: "text-cls-book",
  forced: "text-cls-book",
  inaccuracy: "text-cls-inaccuracy",
  mistake: "text-cls-mistake",
  blunder: "text-cls-blunder",
  "missed-win": "text-cls-missed-win",
};
/** Classes whose SAN text is also tinted in the move list (positive standouts and errors). */
const NOTABLE = new Set<Classification>([
  "brilliant",
  "great",
  "inaccuracy",
  "mistake",
  "blunder",
  "missed-win",
]);
const THEMES = ["classic", "dark", "green", "blue"] as const;

function AnalysisPage() {
  const a = useAnalysis();
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [showArrows, setShowArrows] = useState(true);
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("classic");
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") a.prev();
      else if (e.key === "ArrowRight") a.next();
      else if (e.key === "Home") a.first();
      else if (e.key === "End") a.last();
      else if (e.key === " ") a.setPlaying(!a.playing);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a]);

  const liveLine = a.live?.fen === a.currentFen ? a.live.result?.lines[0] : undefined;
  const mainReview = !a.inVariation && a.ply > 0 ? a.reviews[a.ply - 1] : null;
  // Bar ignores shallow, noisy iterations (depth < 12) so it doesn't jump around.
  const stableLive = liveLine && (liveLine.depth >= 12 || a.live?.done) ? liveLine : undefined;
  const evalScore =
    a.live?.terminal ??
    stableLive?.score ??
    (!a.inVariation ? a.reviewResults[a.ply]?.lines[0]?.score : undefined) ??
    null;

  const arrows: BoardArrow[] = [];
  if (showArrows && liveLine?.pv[0])
    arrows.push({ from: liveLine.pv[0].slice(0, 2), to: liveLine.pv[0].slice(2, 4), kind: "best" });

  return (
    <div className="flex min-h-screen flex-col" data-board-theme={theme}>
      <header className="flex h-11 items-center gap-3 border-b px-3 sm:px-5">
        <span className="font-mono text-sm font-bold tracking-tight text-primary">♜</span>
        <h1 className="text-sm font-semibold tracking-tight">Analysis Board</h1>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setImportOpen(true)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Import PGN
          </button>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as typeof theme)}
            aria-label="Board theme"
            className="rounded-md border bg-panel px-2 py-1 text-xs capitalize"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ToolBtn
            onClick={() => setOrientation(orientation === "w" ? "b" : "w")}
            label="Flip board"
          >
            ⇅
          </ToolBtn>
          <ToolBtn
            onClick={() => setShowArrows(!showArrows)}
            label="Toggle arrows"
            active={showArrows}
          >
            ➚
          </ToolBtn>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-3 lg:flex-row lg:p-5">
        <section className="flex w-full flex-col gap-2 lg:w-auto lg:flex-1 lg:max-w-[min(calc(100vh-7rem),820px)]">
          <PlayerStrip
            name={orientation === "w" ? a.game?.meta.black : a.game?.meta.white}
            elo={orientation === "w" ? a.game?.meta.blackElo : a.game?.meta.whiteElo}
            color={orientation === "w" ? "b" : "w"}
          />
          <div className="flex gap-2">
            <EvalBar score={evalScore} orientation={orientation} />
            <div className="flex-1">
              <Board
                fen={a.currentFen}
                orientation={orientation}
                lastMove={a.currentNode}
                arrows={arrows}
                mark={
                  mainReview && a.currentNode
                    ? {
                        square: a.currentNode.to,
                        tone: `var(--cls-${mainReview.classification})`,
                        symbol: CLASS_INFO[mainReview.classification].symbol,
                        label: CLASS_INFO[mainReview.classification].label,
                      }
                    : null
                }
                onMove={a.makeMove}
              />
            </div>
          </div>
          <PlayerStrip
            name={orientation === "w" ? a.game?.meta.white : a.game?.meta.black}
            elo={orientation === "w" ? a.game?.meta.whiteElo : a.game?.meta.blackElo}
            color={orientation}
          />
          <Controls a={a} />
        </section>

        <aside className="flex w-full flex-col gap-3 lg:w-[400px] lg:shrink-0">
          <EnginePanel a={a} />
          {!a.game && !a.variation ? (
            <div className="panel p-4">
              <PgnForm onLoad={(g) => a.loadGame(g)} />
            </div>
          ) : (
            <>
              <Summary a={a} />
              <MoveList a={a} />
              {a.variation && <VariationPanel a={a} />}
              {mainReview && a.currentNode && (
                <Insight
                  review={mainReview}
                  move={a.currentNode}
                  onPlayBest={() => {
                    if (mainReview.bestUci)
                      a.playFromFen(a.currentNode!.fenBefore, mainReview.bestUci, mainReview.ply);
                  }}
                />
              )}
            </>
          )}
        </aside>
      </main>

      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onClick={() => setImportOpen(false)}
        >
          <div className="panel w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <PgnForm
              onLoad={(g) => {
                a.loadGame(g);
                setImportOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "h-7 w-7 rounded-md border text-sm hover:bg-accent",
        active ? "bg-panel-raised text-primary" : "bg-panel text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PlayerStrip({ name, elo, color }: { name?: string; elo?: string; color: "w" | "b" }) {
  return (
    <div className="flex items-center gap-2 pl-7 text-sm sm:pl-9">
      <span
        className={cn(
          "h-3 w-3 rounded-sm border",
          color === "w" ? "bg-eval-white" : "bg-eval-black",
        )}
      />
      <span className="font-medium">{name ?? (color === "w" ? "White" : "Black")}</span>
      {elo && <span className="font-mono text-xs text-muted-foreground">{elo}</span>}
    </div>
  );
}

function Controls({ a }: { a: AnalysisApi }) {
  const btn = "h-9 flex-1 rounded-md bg-panel-raised text-base hover:bg-accent disabled:opacity-40";
  return (
    <div className="flex gap-1.5 pl-7 sm:pl-9">
      <button className={btn} onClick={a.first} aria-label="First move">
        ⏮
      </button>
      <button className={btn} onClick={a.prev} aria-label="Previous move">
        ◀
      </button>
      <button
        className={cn(btn, a.playing && "text-primary")}
        onClick={() => a.setPlaying(!a.playing)}
        aria-label="Play or pause"
      >
        {a.playing ? "❚❚" : "▶︎▶︎"}
      </button>
      <button className={btn} onClick={a.next} aria-label="Next move">
        ▶
      </button>
      <button className={btn} onClick={a.last} aria-label="Last move">
        ⏭
      </button>
    </div>
  );
}

function EnginePanel({ a }: { a: AnalysisApi }) {
  const live = a.live?.fen === a.currentFen ? a.live : null;
  const line = live?.result?.lines[0];
  const pvSan = useMemo(
    () => (line ? uciToSanLine(a.currentFen, line.pv, 10) : []),
    [line, a.currentFen],
  );
  let status: string;
  if (a.engineStatus === "failed") status = "Engine unavailable — replay still works";
  else if (a.engineStatus === "starting") status = "Engine starting…";
  else if (live?.terminal) status = "Game over in this position";
  else if (live?.done) status = `Complete · depth ${live.result?.depth}`;
  else status = `Calculating · depth ${line?.depth ?? 0}/${LIVE_DEPTH}`;
  return (
    <div className="panel p-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "min-w-[4.5rem] rounded-md px-2 py-1 text-center font-mono text-lg font-bold",
            live?.terminal || line ? "bg-panel-raised" : "bg-panel-raised text-muted-foreground",
          )}
        >
          {live?.terminal ? formatScore(live.terminal) : line ? formatScore(line.score) : "…"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Stockfish · {status}
          </div>
          {pvSan[0] && (
            <div className="truncate text-sm">
              Best{" "}
              <button
                className="font-mono font-semibold text-cls-best hover:underline"
                onClick={() => a.playUci(line!.pv[0])}
                title="Play best move"
              >
                {pvSan[0]}
              </button>
            </div>
          )}
        </div>
      </div>
      {pvSan.length > 0 && (
        <p className="mt-2 line-clamp-2 font-mono text-xs leading-relaxed text-muted-foreground">
          {numberLine(a.currentFen, pvSan)}
        </p>
      )}
    </div>
  );
}

function Summary({ a }: { a: AnalysisApi }) {
  if (!a.game) return null;
  const { meta } = a.game;
  const p = a.reviewProgress;
  const keys: Classification[] = [
    "brilliant",
    "great",
    "inaccuracy",
    "mistake",
    "blunder",
    "missed-win",
  ];
  return (
    <div className="panel p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate font-semibold">
          {meta.white} – {meta.black}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {meta.result} · {Math.ceil(a.mainline.length / 2)} moves
        </div>
      </div>
      {(meta.event || meta.date) && (
        <div className="truncate text-xs text-muted-foreground">
          {[meta.event, meta.date].filter(Boolean).join(" · ")}
        </div>
      )}
      {a.opening && (
        <div className="mt-1 text-xs">
          <span className="font-mono text-muted-foreground">{a.opening.eco}</span> {a.opening.name}
        </div>
      )}
      {p.running && (
        <div className="mt-2">
          <div className="text-[11px] text-muted-foreground">
            Reviewing game · {p.done}/{p.total} positions (depth {REVIEW_DEPTH})
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${(p.done / Math.max(1, p.total)) * 100}%` }}
            />
          </div>
        </div>
      )}
      {a.summary.accuracy && (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th
                className="text-left font-normal"
                title="This app's engine-based accuracy, not Chess.com's metric"
              >
                Engine accuracy
              </th>
              <th className="font-normal">White</th>
              <th className="font-normal">Black</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              <td className="text-center font-mono font-bold">{fmtAcc(a.summary.accuracy.w)}</td>
              <td className="text-center font-mono font-bold">{fmtAcc(a.summary.accuracy.b)}</td>
            </tr>
            {keys.map((k) => (
              <tr key={k}>
                <td className={CLS_TEXT[k]}>
                  {CLASS_INFO[k].symbol} {CLASS_INFO[k].label}
                </td>
                <td className="text-center font-mono">{a.summary.counts.w[k] ?? 0}</td>
                <td className="text-center font-mono">{a.summary.counts.b[k] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
const fmtAcc = (n: number) => (isNaN(n) ? "–" : n.toFixed(1));

function MoveList({ a }: { a: AnalysisApi }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelector("[data-current=true]")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [a.ply, a.variation]);
  const rows: { num: number; w?: MoveNode; b?: MoveNode }[] = [];
  a.mainline.forEach((m) => {
    if (m.color === "w" || !rows.length) rows.push({ num: m.moveNumber, [m.color]: m });
    else rows[rows.length - 1].b = m;
  });
  const cell = (m?: MoveNode) => {
    if (!m) return <span />;
    const r = a.reviews[m.ply];
    const cur = !a.inVariation && a.ply === m.ply + 1;
    const side = a.game?.sideLines.filter((s) => s.branchPly === m.ply) ?? [];
    return (
      <span className="flex min-w-0 flex-col">
        <button
          data-current={cur}
          onClick={() => a.goto(m.ply + 1)}
          className={cn(
            "flex items-center justify-between rounded px-1.5 py-0.5 text-left font-mono text-sm hover:bg-accent",
            cur && "bg-primary/20 text-foreground",
            r?.classification === "brilliant" && "brilliant-glow",
          )}
        >
          <span
            className={cn(
              r && NOTABLE.has(r.classification) && CLS_TEXT[r.classification],
              r && NOTABLE.has(r.classification) && "font-semibold",
            )}
          >
            {m.san}
          </span>
          {r && (
            <span
              className="cls-badge h-4 w-4 text-[9px]"
              style={{ background: `var(--cls-${r.classification})` }}
              title={CLASS_INFO[r.classification].label}
              aria-label={CLASS_INFO[r.classification].label}
            >
              {CLASS_INFO[r.classification].symbol}
            </span>
          )}
        </button>
        {side.map((s, i) => (
          <button
            key={i}
            onClick={() => a.enterVariation({ fromPly: s.branchPly, moves: s.moves }, 1)}
            className="truncate px-1.5 text-left font-mono text-[11px] text-variation hover:underline"
          >
            (
            {numberLine(
              s.moves[0].fenBefore,
              s.moves.map((x) => x.san),
            )}
            )
          </button>
        ))}
      </span>
    );
  };
  return (
    <div ref={ref} className="panel max-h-[40vh] overflow-y-auto p-1.5 lg:max-h-[38vh]">
      {a.mainline.length === 0 && (
        <p className="p-2 text-xs text-muted-foreground">
          No game moves. Moves you play appear as a variation.
        </p>
      )}
      {rows.map((row) => (
        <div
          key={row.num}
          className="grid grid-cols-[2.25rem_1fr_1fr] items-start gap-1 odd:bg-panel-raised/40"
        >
          <span className="py-0.5 pr-1 text-right font-mono text-xs leading-6 text-muted-foreground">
            {row.num}.
          </span>
          {row.w ? (
            cell(row.w)
          ) : (
            <span className="px-1.5 font-mono text-sm text-muted-foreground">…</span>
          )}
          {cell(row.b)}
        </div>
      ))}
    </div>
  );
}

function VariationPanel({ a }: { a: AnalysisApi }) {
  const v = a.variation!;
  return (
    <div className="rounded-lg border border-variation/40 bg-panel p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-variation">
          Variation · not part of the game
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={a.analyzePlayed}
            className="rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Analyze game
          </button>
          <button
            onClick={a.exitVariation}
            className="rounded bg-panel-raised px-2 py-0.5 text-xs hover:bg-accent"
          >
            ↩ Return
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-1 font-mono text-sm">
        {v.moves.map((m, i) => (
          <button
            key={i}
            onClick={() => a.enterVariation(v, i + 1)}
            className={cn("rounded px-1 hover:bg-accent", a.varPos === i + 1 && "bg-variation/25")}
          >
            {(m.color === "w" || i === 0) && (
              <span className="text-muted-foreground">
                {m.moveNumber}
                {m.color === "w" ? "." : "…"}
              </span>
            )}
            {m.san}
          </button>
        ))}
      </div>
    </div>
  );
}

function Insight({
  review,
  move,
  onPlayBest,
}: {
  review: MoveReview;
  move: MoveNode;
  onPlayBest: () => void;
}) {
  const info = CLASS_INFO[review.classification];
  const bad = ["inaccuracy", "mistake", "blunder", "missed-win"].includes(review.classification);
  return (
    <div
      className={cn("panel p-3 text-sm", review.classification === "brilliant" && "brilliant-glow")}
    >
      <div className="flex items-center gap-2">
        <span
          className="cls-badge h-5 w-5 text-[10px]"
          style={{ background: `var(--cls-${review.classification})` }}
          aria-hidden
        >
          {info.symbol}
        </span>
        <span className={cn("font-mono text-base font-bold", CLS_TEXT[review.classification])}>
          {move.san}
          {["!!", "!", "?!", "?", "??"].includes(info.symbol) ? info.symbol : ""}
        </span>
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            CLS_TEXT[review.classification],
          )}
        >
          {info.label}
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {formatScore(review.before)} → {formatScore(review.after)}
        </span>
      </div>
      {bad && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
          <span>
            Win-chance lost:{" "}
            <b className="font-mono text-foreground">{review.winLoss.toFixed(1)}%</b>
          </span>
          {review.bestSan && (
            <span>
              Best:{" "}
              <button
                onClick={onPlayBest}
                className="font-mono font-semibold text-cls-best hover:underline"
              >
                {review.bestSan}
              </button>
            </span>
          )}
        </div>
      )}
      {review.explanation && <p className="mt-1.5 text-xs leading-relaxed">{review.explanation}</p>}
      {bad && review.bestPvSan.length > 1 && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {numberLine(move.fenBefore, review.bestPvSan)}
        </p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground/70">
        Engine-based: inaccuracy ≥{THRESHOLDS.inaccuracy}, mistake ≥{THRESHOLDS.mistake}, blunder ≥
        {THRESHOLDS.blunder} win-% points lost (depth {REVIEW_DEPTH}).
      </p>
    </div>
  );
}

function PgnForm({ onLoad }: { onLoad: (g: ReturnType<typeof parsePgn>) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (t: string) => {
    try {
      onLoad(parsePgn(t));
      setError(null);
    } catch (e) {
      setError(e instanceof PgnError ? e.message : "Could not read this PGN.");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Load a game</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='[White "…"] 1. e4 e5 2. Nf3 …'
        className="h-40 resize-none rounded-md border bg-background p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
      />
      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/15 px-2 py-1.5 text-xs text-destructive"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => submit(text)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          Analyze
        </button>
        <label className="cursor-pointer rounded-md border bg-panel-raised px-3 py-1.5 text-xs hover:bg-accent">
          Upload .pgn
          <input
            type="file"
            accept=".pgn,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const t = await f.text();
                setText(t);
                submit(t);
              }
            }}
          />
        </label>
        <button
          onClick={() => submit(SAMPLE_PGN)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Try sample game
        </button>
      </div>
    </div>
  );
}
