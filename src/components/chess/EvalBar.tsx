import { formatScore, winPct } from "@/lib/chess/eval";
import type { Score } from "@/lib/chess/types";
import { cn } from "@/lib/utils";

export function EvalBar({ score, orientation }: { score: Score | null; orientation: "w" | "b" }) {
  const white = score ? winPct(score) : 50;
  const whiteAhead = white >= 50;
  const label = score ? formatScore(score).replace(/^[+-]/, "") : "";
  const flipped = orientation === "b";
  return (
    <div
      className={cn(
        "relative w-5 shrink-0 overflow-hidden rounded-sm bg-eval-black sm:w-7",
        flipped && "rotate-180",
      )}
      role="meter"
      aria-label="Evaluation"
      aria-valuenow={Math.round(white)}
    >
      <div
        className="absolute bottom-0 left-0 right-0 bg-eval-white transition-[height] duration-500 ease-out"
        style={{ height: `${white}%` }}
      />
      <div className="absolute left-0 right-0 top-1/2 h-px bg-muted-foreground/40" />
      {score && (
        <span
          className={cn(
            "absolute left-0 right-0 text-center font-mono text-[9px] font-bold sm:text-[10px]",
            flipped && "rotate-180",
            whiteAhead ? "bottom-1 text-eval-black" : "top-1 text-eval-white",
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
