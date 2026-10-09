export type Color = "w" | "b";

/** A single move in a line, with the positions before and after it. */
export interface MoveNode {
  ply: number; // 0-based index within its line
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: string;
  piece: string;
  captured?: string;
  color: Color;
  moveNumber: number;
  fenBefore: string;
  fenAfter: string;
  comment?: string;
}

/** A side line found in the imported PGN, branching before mainline move `branchPly`. */
export interface PgnSideLine {
  branchPly: number;
  moves: MoveNode[];
}

export interface GameMeta {
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  event?: string;
  site?: string;
  date?: string;
  result: string;
}

/** The original imported game. Never mutated by exploration. */
export interface Game {
  meta: GameMeta;
  startFen: string;
  moves: MoveNode[];
  sideLines: PgnSideLine[];
  startComment?: string;
}

/** Temporary exploration line branching from the mainline position `fromPly`. */
export interface Variation {
  fromPly: number; // mainline position index (0 = start) where it branches
  moves: MoveNode[];
}

/** Engine score, always from White's point of view. */
export interface Score {
  cp?: number;
  mate?: number; // >0 white mates, <0 black mates
  terminal?: "w" | "b" | "draw"; // game already over in this position
}

export interface PvLine {
  multipv: number;
  depth: number;
  score: Score;
  pv: string[]; // UCI moves
}

export interface EngineResult {
  fen: string;
  depth: number;
  lines: PvLine[];
}

export type Classification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "missed-win";

export interface MoveReview {
  ply: number;
  classification: Classification;
  winLoss: number; // win-percentage points lost by the mover
  accuracy: number;
  before: Score;
  after: Score;
  bestUci?: string;
  bestSan?: string;
  bestPvSan: string[];
  explanation?: string;
}

export type EngineStatus = "starting" | "ready" | "failed";
