import { Chess, type Square } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface BoardArrow {
  from: string;
  to: string;
  kind: "best" | "played";
}

interface Props {
  fen: string;
  orientation: "w" | "b";
  lastMove?: { from: string; to: string } | null;
  arrows?: BoardArrow[];
  /** Classification marker on the current move's destination square. `tone` is a CSS color. */
  mark?: { square: string; tone: string; symbol: string; label: string } | null;
  onMove: (from: string, to: string, promotion?: string) => boolean;
}

const FILES = "abcdefgh";

function squareAt(r: number, c: number, o: "w" | "b") {
  return o === "w" ? FILES[c] + (8 - r) : FILES[7 - c] + (r + 1);
}
function coords(sq: string, o: "w" | "b") {
  const f = FILES.indexOf(sq[0]);
  const rk = Number(sq[1]);
  return o === "w" ? { r: 8 - rk, c: f } : { r: rk - 1, c: 7 - f };
}

const pieceSrc = (color: string, type: string) => `/pieces/${color}${type.toUpperCase()}.svg`;

export function Board({ fen, orientation, lastMove, arrows = [], mark, onMove }: Props) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = chess.board();
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ sq: string; x: number; y: number } | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [fen]);

  const targets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to));
  }, [chess, selected]);

  let checkSq: string | null = null;
  if (chess.inCheck()) {
    board.forEach((row) =>
      row.forEach((p) => {
        if (p && p.type === "k" && p.color === chess.turn()) checkSq = p.square;
      }),
    );
  }

  function attempt(from: string, to: string) {
    const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) return false;
    if (legal.some((m) => m.promotion)) {
      setPromo({ from, to });
      return true;
    }
    onMove(from, to);
    setSelected(null);
    return true;
  }

  function sqFromPoint(x: number, y: number) {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const c = Math.floor(((x - rect.left) / rect.width) * 8);
    const r = Math.floor(((y - rect.top) / rect.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return squareAt(r, c, orientation);
  }

  function onPointerDown(e: React.PointerEvent, sq: string) {
    if (promo) return;
    const p = chess.get(sq as Square);
    if (selected && selected !== sq && targets.has(sq)) {
      attempt(selected, sq);
      return;
    }
    if (p && p.color === chess.turn()) {
      setSelected(sq);
      setDrag({ sq, x: e.clientX, y: e.clientY });
      e.preventDefault();
    } else setSelected(null);
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) =>
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const to = sqFromPoint(e.clientX, e.clientY);
      const from = drag.sq;
      setDrag(null);
      if (to && to !== from) attempt(from, to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.sq]);

  const rect = ref.current?.getBoundingClientRect();
  const sqSize = rect ? rect.width / 8 : 0;
  const dragging = drag && rect && (Math.abs(drag.x - rect.left) > 0 || true);

  return (
    <div
      ref={ref}
      data-fen={fen}
      className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-md shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]"
    >
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, i) => {
          const r = Math.floor(i / 8);
          const c = i % 8;
          const sq = squareAt(r, c, orientation);
          const { r: br, c: bc } = coords(sq, "w");
          const piece = board[br][bc];
          const light = (r + c) % 2 === 0;
          const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
          const isTarget = targets.has(sq);
          const hidden = drag?.sq === sq;
          return (
            <div
              key={sq}
              onPointerDown={(e) => onPointerDown(e, sq)}
              className={cn(
                "relative",
                light ? "sq-light" : "sq-dark",
                isTarget && (piece ? "sq-ring" : "sq-dot"),
              )}
            >
              {isLast && (
                <div
                  className="sq-last absolute inset-0"
                  style={
                    mark
                      ? { background: `color-mix(in oklch, ${mark.tone} 45%, transparent)` }
                      : undefined
                  }
                />
              )}
              {selected === sq && <div className="sq-select absolute inset-0" />}
              {checkSq === sq && <div className="sq-check absolute inset-0" />}
              {c === 0 && (
                <span
                  className={cn(
                    "absolute left-[3%] top-[2%] font-mono text-[clamp(8px,1.4vw,12px)] font-semibold leading-none",
                    light ? "text-[color:var(--sq-dark)]" : "text-[color:var(--sq-light)]",
                  )}
                >
                  {sq[1]}
                </span>
              )}
              {r === 7 && (
                <span
                  className={cn(
                    "absolute bottom-[2%] right-[4%] font-mono text-[clamp(8px,1.4vw,12px)] font-semibold leading-none",
                    light ? "text-[color:var(--sq-dark)]" : "text-[color:var(--sq-light)]",
                  )}
                >
                  {sq[0]}
                </span>
              )}
              {piece && (
                <img
                  src={pieceSrc(piece.color, piece.type)}
                  alt={`${piece.color === "w" ? "White" : "Black"} ${piece.type}`}
                  draggable={false}
                  className={cn(
                    "absolute inset-0 h-full w-full cursor-grab p-[3%]",
                    hidden && "opacity-30",
                    piece.color !== chess.turn() && "cursor-default",
                  )}
                />
              )}
              {mark?.square === sq && (
                <span
                  key={fen}
                  title={mark.label}
                  aria-label={mark.label}
                  data-mark={mark.label}
                  className="cls-badge badge-pop absolute right-[1%] top-[1%] z-10 h-[42%] w-[42%] text-[clamp(9px,1.7vw,15px)]"
                  style={{ background: mark.tone }}
                >
                  {mark.symbol}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {arrows.length > 0 && (
        <svg viewBox="0 0 8 8" className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            {(["best", "played"] as const).map((k) => (
              <marker
                key={k}
                id={`ah-${k}`}
                markerWidth="3.2"
                markerHeight="3.2"
                refX="1.6"
                refY="1.6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L3.2,1.6 L0,3.2 z" fill={`var(--arrow-${k})`} />
              </marker>
            ))}
          </defs>
          {arrows.map((a, i) => {
            const f = coords(a.from, orientation);
            const t = coords(a.to, orientation);
            const x1 = f.c + 0.5,
              y1 = f.r + 0.5,
              x2 = t.c + 0.5,
              y2 = t.r + 0.5;
            const len = Math.hypot(x2 - x1, y2 - y1);
            const sh = 0.38 / len;
            return (
              <line
                key={i}
                x1={x1 + ((x2 - x1) * 0.18) / len}
                y1={y1 + ((y2 - y1) * 0.18) / len}
                x2={x2 - (x2 - x1) * sh}
                y2={y2 - (y2 - y1) * sh}
                stroke={`var(--arrow-${a.kind})`}
                strokeWidth={a.kind === "best" ? 0.16 : 0.12}
                strokeLinecap="round"
                markerEnd={`url(#ah-${a.kind})`}
              />
            );
          })}
        </svg>
      )}

      {drag && dragging && rect && (
        <img
          src={pieceSrc(chess.get(drag.sq as Square)!.color, chess.get(drag.sq as Square)!.type)}
          alt=""
          className="pointer-events-none fixed z-50"
          style={{
            width: sqSize,
            height: sqSize,
            left: drag.x - sqSize / 2,
            top: drag.y - sqSize / 2,
          }}
        />
      )}

      {promo && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
          <div className="panel flex gap-1 p-2">
            {["q", "r", "b", "n"].map((p) => (
              <button
                key={p}
                onClick={() => {
                  onMove(promo.from, promo.to, p);
                  setPromo(null);
                  setSelected(null);
                }}
                className="h-16 w-16 rounded-md bg-panel-raised transition-colors hover:bg-accent"
                aria-label={`Promote to ${p}`}
              >
                <img src={pieceSrc(chess.turn(), p)} alt="" className="h-full w-full p-1" />
              </button>
            ))}
            <button
              onClick={() => setPromo(null)}
              className="px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
