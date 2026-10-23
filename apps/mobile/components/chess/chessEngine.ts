import type { ChessColor, ChessPiece, ChessPieceType } from "@chatapp/shared";

export type Board = (ChessPiece | null)[][];

export interface MoveOption {
  toRow: number;
  toCol: number;
  isCapture: boolean;
  notation: string;
}

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const officers: ChessPieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

  // Black pieces (top: rows 0 & 1)
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: officers[c], color: "b" };
    board[1][c] = { type: "p", color: "b" };
  }

  // White pieces (bottom: rows 6 & 7)
  for (let c = 0; c < 8; c++) {
    board[6][c] = { type: "p", color: "w" };
    board[7][c] = { type: officers[c], color: "w" };
  }

  return board;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function coordToAlgebraic(row: number, col: number): string {
  const file = String.fromCharCode(97 + col);
  const rank = 8 - row;
  return `${file}${rank}`;
}

export function algebraicToCoord(sq: string): { row: number; col: number } | null {
  if (sq.length !== 2) return null;
  const col = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10);
  const row = 8 - rank;
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return { row, col };
}

export function isInside(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/**
 * Generates pseudo-legal moves without checking if own King is left in check
 */
export function getPseudoLegalMoves(board: Board, row: number, col: number): MoveOption[] {
  const piece = board[row][col];
  if (!piece) return [];

  const moves: MoveOption[] = [];
  const color = piece.color;
  const enemyColor: ChessColor = color === "w" ? "b" : "w";

  // Ray-caster helper for Bishop, Rook, Queen
  const castRays = (dirs: [number, number][]) => {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (isInside(r, c)) {
        const dest = board[r][c];
        if (!dest) {
          moves.push({ toRow: r, toCol: c, isCapture: false, notation: coordToAlgebraic(r, c) });
        } else {
          if (dest.color === enemyColor) {
            moves.push({ toRow: r, toCol: c, isCapture: true, notation: coordToAlgebraic(r, c) });
          }
          break; // Hit piece, ray stops
        }
        r += dr;
        c += dc;
      }
    }
  };

  switch (piece.type) {
    case "p": {
      const forward = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;

      // 1 step forward
      const r1 = row + forward;
      if (isInside(r1, col) && !board[r1][col]) {
        moves.push({ toRow: r1, toCol: col, isCapture: false, notation: coordToAlgebraic(r1, col) });

        // 2 steps forward from start rank
        const r2 = row + forward * 2;
        if (row === startRow && isInside(r2, col) && !board[r2][col]) {
          moves.push({ toRow: r2, toCol: col, isCapture: false, notation: coordToAlgebraic(r2, col) });
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const cDiag = col + dc;
        if (isInside(r1, cDiag)) {
          const target = board[r1][cDiag];
          if (target && target.color === enemyColor) {
            moves.push({ toRow: r1, toCol: cDiag, isCapture: true, notation: coordToAlgebraic(r1, cDiag) });
          }
        }
      }
      break;
    }

    case "n": {
      const offsets: [number, number][] = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      for (const [dr, dc] of offsets) {
        const r = row + dr;
        const c = col + dc;
        if (isInside(r, c)) {
          const dest = board[r][c];
          if (!dest) {
            moves.push({ toRow: r, toCol: c, isCapture: false, notation: coordToAlgebraic(r, c) });
          } else if (dest.color === enemyColor) {
            moves.push({ toRow: r, toCol: c, isCapture: true, notation: coordToAlgebraic(r, c) });
          }
        }
      }
      break;
    }

    case "b":
      castRays([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
      break;

    case "r":
      castRays([[-1, 0], [1, 0], [0, -1], [0, 1]]);
      break;

    case "q":
      castRays([
        [-1, -1], [-1, 1], [1, -1], [1, 1],
        [-1, 0], [1, 0], [0, -1], [0, 1],
      ]);
      break;

    case "k": {
      const kingDirs: [number, number][] = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1],
      ];
      for (const [dr, dc] of kingDirs) {
        const r = row + dr;
        const c = col + dc;
        if (isInside(r, c)) {
          const dest = board[r][c];
          if (!dest) {
            moves.push({ toRow: r, toCol: c, isCapture: false, notation: coordToAlgebraic(r, c) });
          } else if (dest.color === enemyColor) {
            moves.push({ toRow: r, toCol: c, isCapture: true, notation: coordToAlgebraic(r, c) });
          }
        }
      }
      break;
    }
  }

  return moves;
}

export function findKing(board: Board, color: ChessColor): { row: number; col: number } | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === "k" && piece.color === color) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function isKingInCheck(board: Board, color: ChessColor): boolean {
  const kingCoord = findKing(board, color);
  if (!kingCoord) return false;

  const enemyColor: ChessColor = color === "w" ? "b" : "w";

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === enemyColor) {
        const moves = getPseudoLegalMoves(board, r, c);
        if (moves.some((m) => m.toRow === kingCoord.row && m.toCol === kingCoord.col)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Returns strictly legal moves (moves where own King is NOT left in check)
 */
export function getLegalMoves(board: Board, row: number, col: number): MoveOption[] {
  const piece = board[row][col];
  if (!piece) return [];

  const pseudoMoves = getPseudoLegalMoves(board, row, col);
  const legalMoves: MoveOption[] = [];

  for (const move of pseudoMoves) {
    const clone = cloneBoard(board);
    // Apply move on clone
    clone[move.toRow][move.toCol] = clone[row][col];
    clone[row][col] = null;

    // Promotion check for pawn
    if (piece.type === "p" && (move.toRow === 0 || move.toRow === 7)) {
      clone[move.toRow][move.toCol] = { type: "q", color: piece.color };
    }

    if (!isKingInCheck(clone, piece.color)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

export interface GameStatus {
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  winner: ChessColor | "draw" | null;
}

export function evaluateGameStatus(board: Board, turn: ChessColor): GameStatus {
  const inCheck = isKingInCheck(board, turn);

  let hasAnyLegalMove = false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === turn) {
        const moves = getLegalMoves(board, r, c);
        if (moves.length > 0) {
          hasAnyLegalMove = true;
          break;
        }
      }
    }
    if (hasAnyLegalMove) break;
  }

  if (!hasAnyLegalMove) {
    if (inCheck) {
      // Checkmate! The other color wins
      return {
        isCheck: true,
        isCheckmate: true,
        isStalemate: false,
        winner: turn === "w" ? "b" : "w",
      };
    } else {
      // Stalemate!
      return {
        isCheck: false,
        isCheckmate: false,
        isStalemate: true,
        winner: "draw",
      };
    }
  }

  return {
    isCheck: inCheck,
    isCheckmate: false,
    isStalemate: false,
    winner: null,
  };
}

// Material values for evaluation and captured counts
export const PIECE_VALUES: Record<ChessPieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

// Heuristic score for Bot AI
const PIECE_WEIGHTS: Record<ChessPieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Center bonus (ranks 3..4, files 3..4)
function getSquareBonus(r: number, c: number): number {
  const distFromCenter = Math.abs(3.5 - r) + Math.abs(3.5 - c);
  return (7 - distFromCenter) * 3;
}

/**
 * Pick best move for Bot AI
 */
export function getBotBestMove(
  board: Board,
  botColor: ChessColor
): { fromRow: number; fromCol: number; toRow: number; toCol: number } | null {
  const allMoves: { fromRow: number; fromCol: number; toRow: number; toCol: number; score: number }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === botColor) {
        const legal = getLegalMoves(board, r, c);
        for (const m of legal) {
          const target = board[m.toRow][m.toCol];
          let score = 0;

          // Capture value
          if (target) {
            score += PIECE_WEIGHTS[target.type] * 10 - PIECE_WEIGHTS[piece.type];
          }

          // Center positioning bonus
          score += getSquareBonus(m.toRow, m.toCol);

          // Pawn promotion high value
          if (piece.type === "p" && (m.toRow === 0 || m.toRow === 7)) {
            score += 800;
          }

          // Simulate opponent response: check if move delivers check
          const clone = cloneBoard(board);
          clone[m.toRow][m.toCol] = clone[r][c];
          clone[r][c] = null;
          const enemyColor: ChessColor = botColor === "w" ? "b" : "w";
          if (isKingInCheck(clone, enemyColor)) {
            score += 150;
          }

          // Add slight randomness (0 to 30) so bot doesn't play identical moves
          score += Math.random() * 30;

          allMoves.push({
            fromRow: r,
            fromCol: c,
            toRow: m.toRow,
            toCol: m.toCol,
            score,
          });
        }
      }
    }
  }

  if (allMoves.length === 0) return null;

  allMoves.sort((a, b) => b.score - a.score);
  return allMoves[0];
}

export const PIECE_GLYPHS: Record<ChessColor, Record<ChessPieceType, string>> = {
  w: {
    k: "♔",
    q: "♕",
    r: "♖",
    b: "♗",
    n: "♘",
    p: "♙",
  },
  b: {
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
  },
};
