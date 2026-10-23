import type {
  ChessColor,
  ChessGameState,
  ChessMove,
  ChessPiece,
  ChessPieceType,
  CreateChessRoomPayload,
  JoinChessRoomPayload,
  MoveChessPayload,
} from "@chatapp/shared";
import type { Server as SocketIOServer } from "socket.io";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CH";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function createInitialBoard(): (ChessPiece | null)[][] {
  const board: (ChessPiece | null)[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(null)
  );

  const backRank: ChessPieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

  // Black pieces (top: row 0 & 1)
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: "b" };
    board[1][c] = { type: "p", color: "b" };
  }

  // White pieces (bottom: row 6 & 7)
  for (let c = 0; c < 8; c++) {
    board[6][c] = { type: "p", color: "w" };
    board[7][c] = { type: backRank[c], color: "w" };
  }

  return board;
}

// Convert "e2" to { row, col }
export function algebraicToCoord(sq: string): { row: number; col: number } | null {
  if (sq.length !== 2) return null;
  const col = sq.charCodeAt(0) - 97; // 'a' -> 0
  const rank = parseInt(sq[1], 10);  // 1 -> 8
  const row = 8 - rank;              // 8 -> 0, 1 -> 7
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return { row, col };
}

export function coordToAlgebraic(row: number, col: number): string {
  const file = String.fromCharCode(97 + col);
  const rank = 8 - row;
  return `${file}${rank}`;
}

export function isInside(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function cloneBoard(board: (ChessPiece | null)[][]): (ChessPiece | null)[][] {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function getPseudoLegalMoves(board: (ChessPiece | null)[][], row: number, col: number): { toRow: number; toCol: number }[] {
  const piece = board[row][col];
  if (!piece) return [];
  const moves: { toRow: number; toCol: number }[] = [];
  const enemyColor: ChessColor = piece.color === "w" ? "b" : "w";

  const castRays = (dirs: [number, number][]) => {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (isInside(r, c)) {
        const dest = board[r][c];
        if (!dest) {
          moves.push({ toRow: r, toCol: c });
        } else {
          if (dest.color === enemyColor) moves.push({ toRow: r, toCol: c });
          break;
        }
        r += dr;
        c += dc;
      }
    }
  };

  switch (piece.type) {
    case "p": {
      const forward = piece.color === "w" ? -1 : 1;
      const startRow = piece.color === "w" ? 6 : 1;
      const r1 = row + forward;
      if (isInside(r1, col) && !board[r1][col]) {
        moves.push({ toRow: r1, toCol: col });
        const r2 = row + forward * 2;
        if (row === startRow && isInside(r2, col) && !board[r2][col]) {
          moves.push({ toRow: r2, toCol: col });
        }
      }
      for (const dc of [-1, 1]) {
        const cDiag = col + dc;
        if (isInside(r1, cDiag) && board[r1][cDiag]?.color === enemyColor) {
          moves.push({ toRow: r1, toCol: cDiag });
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
        if (isInside(r, c) && board[r][c]?.color !== piece.color) {
          moves.push({ toRow: r, toCol: c });
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
        if (isInside(r, c) && board[r][c]?.color !== piece.color) {
          moves.push({ toRow: r, toCol: c });
        }
      }
      break;
    }
  }
  return moves;
}

export function findKing(board: (ChessPiece | null)[][], color: ChessColor): { row: number; col: number } | null {
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

export function isKingInCheck(board: (ChessPiece | null)[][], color: ChessColor): boolean {
  const king = findKing(board, color);
  if (!king) return false;
  const enemyColor: ChessColor = color === "w" ? "b" : "w";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === enemyColor) {
        const moves = getPseudoLegalMoves(board, r, c);
        if (moves.some((m) => m.toRow === king.row && m.toCol === king.col)) return true;
      }
    }
  }
  return false;
}

export function getLegalMoves(board: (ChessPiece | null)[][], row: number, col: number): { toRow: number; toCol: number }[] {
  const piece = board[row][col];
  if (!piece) return [];
  const pseudo = getPseudoLegalMoves(board, row, col);
  const legal: { toRow: number; toCol: number }[] = [];
  for (const m of pseudo) {
    const clone = cloneBoard(board);
    clone[m.toRow][m.toCol] = clone[row][col];
    clone[row][col] = null;
    if (!isKingInCheck(clone, piece.color)) legal.push(m);
  }
  return legal;
}

export function evaluateGameStatus(board: (ChessPiece | null)[][], turn: ChessColor): {
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  winner: ChessColor | "draw" | null;
} {
  const inCheck = isKingInCheck(board, turn);
  let hasAnyLegalMove = false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === turn) {
        if (getLegalMoves(board, r, c).length > 0) {
          hasAnyLegalMove = true;
          break;
        }
      }
    }
    if (hasAnyLegalMove) break;
  }

  if (!hasAnyLegalMove) {
    if (inCheck) {
      return { isCheck: true, isCheckmate: true, isStalemate: false, winner: turn === "w" ? "b" : "w" };
    } else {
      return { isCheck: false, isCheckmate: false, isStalemate: true, winner: "draw" };
    }
  }

  return { isCheck: inCheck, isCheckmate: false, isStalemate: false, winner: null };
}

export class ChessService {
  private rooms = new Map<string, ChessGameState>();
  private codeToRoomId = new Map<string, string>();

  createRoom(payload: CreateChessRoomPayload): ChessGameState {
    const roomId = `chess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const code = generateCode();
    const preferredColor = payload.preferredColor || "w";

    const hostPlayer = {
      userId: payload.adminId,
      name: payload.name,
      username: payload.username,
      color: preferredColor,
      connected: true,
      timeLeftSeconds: 600,
    };

    const room: ChessGameState = {
      roomId,
      code,
      whitePlayer: preferredColor === "w" ? hostPlayer : null,
      blackPlayer: preferredColor === "b" ? hostPlayer : null,
      turn: "w",
      board: createInitialBoard(),
      moveHistory: [],
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      winner: null,
      status: "waiting",
      capturedWhite: [],
      capturedBlack: [],
    };

    this.rooms.set(roomId, room);
    this.codeToRoomId.set(code.toUpperCase(), roomId);
    return room;
  }

  joinRoom(payload: JoinChessRoomPayload): ChessGameState {
    const roomId = this.codeToRoomId.get(payload.code.toUpperCase());
    if (!roomId) throw new Error("Chess room not found with this code");

    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Chess room no longer exists");

    // Check if user is already in room
    if (room.whitePlayer?.userId === payload.userId) {
      room.whitePlayer.connected = true;
      return room;
    }
    if (room.blackPlayer?.userId === payload.userId) {
      room.blackPlayer.connected = true;
      return room;
    }

    // Assign open slot
    if (!room.whitePlayer) {
      room.whitePlayer = {
        userId: payload.userId,
        name: payload.name,
        username: payload.username,
        color: "w",
        connected: true,
        timeLeftSeconds: 600,
      };
    } else if (!room.blackPlayer) {
      room.blackPlayer = {
        userId: payload.userId,
        name: payload.name,
        username: payload.username,
        color: "b",
        connected: true,
        timeLeftSeconds: 600,
      };
    } else {
      throw new Error("Chess room is full (2 players already present)");
    }

    if (room.whitePlayer && room.blackPlayer) {
      room.status = "playing";
    }

    return room;
  }

  makeMove(payload: MoveChessPayload, io: SocketIOServer<any, any>): ChessGameState {
    const room = this.rooms.get(payload.roomId);
    if (!room) throw new Error("Room not found");
    if (room.status !== "playing") throw new Error("Game is not active");

    const currentPlayer = room.turn === "w" ? room.whitePlayer : room.blackPlayer;
    if (!currentPlayer || currentPlayer.userId !== payload.userId) {
      throw new Error("Not your turn!");
    }

    const fromCoord = algebraicToCoord(payload.from);
    const toCoord = algebraicToCoord(payload.to);
    if (!fromCoord || !toCoord) throw new Error("Invalid square coordinates");

    const piece = room.board[fromCoord.row][fromCoord.col];
    if (!piece) throw new Error("No piece on source square");
    if (piece.color !== room.turn) throw new Error("Cannot move opponent piece");

    const destPiece = room.board[toCoord.row][toCoord.col];

    // Pawn promotion
    let finalPiece = { ...piece };
    if (piece.type === "p" && (toCoord.row === 0 || toCoord.row === 7)) {
      finalPiece.type = payload.promotion || "q";
    }

    // Apply move
    room.board[fromCoord.row][fromCoord.col] = null;
    room.board[toCoord.row][toCoord.col] = finalPiece;

    if (destPiece) {
      if (destPiece.color === "w") {
        room.capturedWhite.push(destPiece);
      } else {
        room.capturedBlack.push(destPiece);
      }
    }

    const notation = `${piece.type !== "p" ? piece.type.toUpperCase() : ""}${destPiece ? "x" : ""}${payload.to}`;
    const moveRecord: ChessMove = {
      from: payload.from,
      to: payload.to,
      piece,
      captured: destPiece || undefined,
      promotion: finalPiece.type !== piece.type ? finalPiece.type : undefined,
      notation,
    };

    room.moveHistory.push(moveRecord);
    room.lastMove = { from: payload.from, to: payload.to };

    // Toggle turn
    room.turn = room.turn === "w" ? "b" : "w";

    // Evaluate check & checkmate
    const status = evaluateGameStatus(room.board, room.turn);
    room.isCheck = status.isCheck;
    room.isCheckmate = status.isCheckmate;
    room.isStalemate = status.isStalemate;
    room.winner = status.winner;
    if (status.isCheckmate || status.isStalemate) {
      room.status = "game_over";
    }

    // Broadcast move and new state
    io.to(`chess:${room.roomId}`).emit("chess:state", room);
    io.to(`chess:${room.roomId}`).emit("chess:moveMade", { move: moveRecord, room });

    return room;
  }

  resetRoom(roomId: string, io: SocketIOServer<any, any>): ChessGameState {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    room.board = createInitialBoard();
    room.moveHistory = [];
    room.isCheck = false;
    room.isCheckmate = false;
    room.isStalemate = false;
    room.winner = null;
    room.turn = "w";
    room.capturedWhite = [];
    room.capturedBlack = [];
    room.lastMove = undefined;
    room.status = (room.whitePlayer && room.blackPlayer) ? "playing" : "waiting";

    io.to(`chess:${room.roomId}`).emit("chess:state", room);
    return room;
  }

  leaveRoom(roomId: string, userId: string, io: SocketIOServer<any, any>): ChessGameState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (room.status === "playing") {
      // Exiting an active game counts as a forfeit and loss for that player
      if (room.whitePlayer?.userId === userId) {
        room.winner = "b"; // Black wins
        room.status = "game_over";
        room.resignedBy = userId;
        room.resignedByName = room.whitePlayer.name;
        io.to(`chess:${room.roomId}`).emit("chess:state", room);
      } else if (room.blackPlayer?.userId === userId) {
        room.winner = "w"; // White wins
        room.status = "game_over";
        room.resignedBy = userId;
        room.resignedByName = room.blackPlayer.name;
        io.to(`chess:${room.roomId}`).emit("chess:state", room);
      }
    } else if (room.status === "waiting") {
      if (room.whitePlayer?.userId === userId) {
        room.whitePlayer = null;
      } else if (room.blackPlayer?.userId === userId) {
        room.blackPlayer = null;
      }
      if (!room.whitePlayer && !room.blackPlayer) {
        this.rooms.delete(roomId);
        this.codeToRoomId.delete(room.code);
        return null;
      }
      io.to(`chess:${room.roomId}`).emit("chess:state", room);
    }

    return room;
  }

  getRoom(roomId: string): ChessGameState | undefined {
    return this.rooms.get(roomId);
  }
}

export const chessService = new ChessService();
