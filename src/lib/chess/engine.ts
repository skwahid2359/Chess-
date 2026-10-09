import type { EngineResult, EngineStatus, PvLine, Score } from "./types";

interface Job {
  fen: string;
  depth: number;
  multipv: number;
  onInfo?: (r: EngineResult) => void;
  resolve: (r: EngineResult | null) => void;
  cancelled: boolean;
  lines: Map<number, PvLine>;
}

const cache = new Map<string, EngineResult>();

function cacheKey(fen: string, multipv: number) {
  // Ignore move counters so transpositions share results.
  return fen.split(" ").slice(0, 4).join(" ") + "|" + multipv;
}

export function getCached(fen: string, multipv: number, minDepth: number) {
  const hit =
    cache.get(cacheKey(fen, multipv)) ?? (multipv === 1 ? cache.get(cacheKey(fen, 2)) : undefined);
  return hit && hit.depth >= minDepth ? hit : null;
}

/** Thin UCI wrapper around Stockfish running in a Web Worker. One search at a time; new requests cancel stale ones. */
export class UciEngine {
  status: EngineStatus = "starting";
  private worker: Worker | null = null;
  private current: Job | null = null;
  private pending: Job | null = null;
  private searching = false;
  private listeners = new Set<(s: EngineStatus) => void>();

  constructor() {
    try {
      this.worker = new Worker("/stockfish/stockfish-19-lite-single.js");
      this.worker.onmessage = (e) => this.onLine(String(e.data));
      this.worker.onerror = () => this.fail();
      this.post("uci");
      setTimeout(() => {
        if (this.status === "starting") this.fail();
      }, 20000);
    } catch {
      this.fail();
    }
  }

  onStatus(fn: (s: EngineStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  private fail() {
    this.setStatus("failed");
    this.current?.resolve(null);
    this.pending?.resolve(null);
    this.current = this.pending = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private post(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  analyze(
    fen: string,
    depth: number,
    multipv = 1,
    onInfo?: (r: EngineResult) => void,
  ): Promise<EngineResult | null> {
    const hit = getCached(fen, multipv, depth);
    if (hit) {
      onInfo?.(hit);
      this.cancel();
      return Promise.resolve(hit);
    }
    if (this.status === "failed") return Promise.resolve(null);
    return new Promise((resolve) => {
      const job: Job = { fen, depth, multipv, onInfo, resolve, cancelled: false, lines: new Map() };
      if (this.pending) {
        this.pending.resolve(null);
        this.pending = null;
      }
      if (this.current && this.searching) {
        this.current.cancelled = true;
        this.pending = job;
        this.post("stop");
      } else {
        if (this.current) this.current.resolve(null);
        this.current = job;
        if (this.status === "ready") this.launch();
      }
    });
  }

  cancel() {
    if (this.pending) {
      this.pending.resolve(null);
      this.pending = null;
    }
    if (this.current && this.searching) {
      this.current.cancelled = true;
      this.post("stop");
    }
  }

  private launch() {
    const job = this.current;
    if (!job) return;
    this.searching = true;
    this.post(`setoption name MultiPV value ${job.multipv}`);
    this.post(`position fen ${job.fen}`);
    this.post(`go depth ${job.depth}`);
  }

  private build(job: Job): EngineResult {
    const lines = [...job.lines.values()].sort((a, b) => a.multipv - b.multipv);
    return { fen: job.fen, depth: lines[0]?.depth ?? 0, lines };
  }

  private onLine(line: string) {
    if (line === "uciok") {
      this.post("setoption name Hash value 32");
      this.post("isready");
      return;
    }
    if (line === "readyok") {
      if (this.status === "starting") {
        this.setStatus("ready");
        if (this.current) this.launch();
      }
      return;
    }
    const job = this.current;
    if (!job) return;
    if (line.startsWith("info ") && line.includes(" pv ") && line.includes(" score ")) {
      if (job.cancelled) return;
      if (line.includes("lowerbound") || line.includes("upperbound")) return;
      const parsed = parseInfo(line, job.fen);
      if (!parsed) return;
      job.lines.set(parsed.multipv, parsed);
      // Drop deeper-numbered lines from older iterations so lines stay consistent.
      job.onInfo?.(this.build(job));
      return;
    }
    if (line.startsWith("bestmove")) {
      this.searching = false;
      this.current = null;
      if (job.cancelled) {
        job.resolve(null);
      } else {
        const result = this.build(job);
        if (result.lines.length) cache.set(cacheKey(job.fen, job.multipv), result);
        job.resolve(result.lines.length ? result : null);
      }
      if (this.pending) {
        this.current = this.pending;
        this.pending = null;
        this.launch();
      }
    }
  }

  destroy() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}

function parseInfo(line: string, fen: string): PvLine | null {
  const t = line.split(" ");
  const get = (k: string) => {
    const i = t.indexOf(k);
    return i >= 0 ? t[i + 1] : undefined;
  };
  const depth = Number(get("depth"));
  const multipv = Number(get("multipv") ?? 1);
  const si = t.indexOf("score");
  const pi = t.indexOf("pv");
  if (si < 0 || pi < 0 || !depth) return null;
  const kind = t[si + 1];
  const val = Number(t[si + 2]);
  const whiteToMove = fen.split(" ")[1] === "w";
  const sign = whiteToMove ? 1 : -1;
  const score: Score = kind === "mate" ? { mate: val * sign } : { cp: val * sign };
  const pv = t.slice(pi + 1).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
  if (!pv.length) return null;
  return { multipv, depth, score, pv };
}
