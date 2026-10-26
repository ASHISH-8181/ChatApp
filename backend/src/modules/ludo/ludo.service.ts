import type {
  AddLudoBotPayload,
  CreateLudoRoomPayload,
  JoinLudoRoomPayload,
  LudoColor,
  LudoGameState,
  LudoPlayer,
  LudoToken,
  MoveLudoTokenPayload,
  RollLudoDicePayload,
} from "@chatapp/shared";
import type { Server as SocketIOServer } from "socket.io";

const ALL_COLORS: LudoColor[] = ["RED", "GREEN", "YELLOW", "BLUE", "PURPLE", "ORANGE"];

export function getLudoConfig(maxPlayers: number) {
  if (maxPlayers <= 4) {
    return {
      trackLength: 52,
      offsets: {
        RED: 0,
        GREEN: 13,
        YELLOW: 26,
        BLUE: 39,
        PURPLE: 0,
        ORANGE: 0,
      } as Record<LudoColor, number>,
      safeTiles: [0, 8, 13, 21, 26, 34, 39, 47],
      outerTrackLimit: 50,
      winStep: 56,
    };
  } else {
    return {
      trackLength: 60,
      offsets: {
        RED: 0,
        GREEN: 10,
        YELLOW: 20,
        BLUE: 30,
        PURPLE: 40,
        ORANGE: 50,
      } as Record<LudoColor, number>,
      safeTiles: [0, 8, 10, 18, 20, 28, 30, 38, 40, 48, 50, 58],
      outerTrackLimit: 50,
      winStep: 56,
    };
  }
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "LU";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function createTokens(color: LudoColor): LudoToken[] {
  return [0, 1, 2, 3].map((id) => ({
    id,
    color,
    step: -1, // -1 means in yard
    isHome: false,
    inYard: true,
  }));
}

export class LudoService {
  private rooms = new Map<string, LudoGameState>();
  private codeToRoomId = new Map<string, string>();

  createRoom(payload: CreateLudoRoomPayload): LudoGameState {
    const roomId = `ludo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const code = generateCode();
    const maxPlayers = Math.min(Math.max(payload.maxPlayers || 4, 2), 6);
    const hostColor = payload.color || "RED";

    const hostPlayer: LudoPlayer = {
      id: `p-${payload.adminId}`,
      userId: payload.adminId,
      name: payload.name,
      username: payload.username,
      color: hostColor,
      tokens: createTokens(hostColor),
      hasFinished: false,
      consecutiveSixes: 0,
    };

    const room: LudoGameState = {
      roomId,
      code,
      adminId: payload.adminId,
      maxPlayers,
      players: [hostPlayer],
      currentTurnColor: hostColor,
      diceValue: null,
      hasRolled: false,
      status: "waiting",
      winnerList: [],
      lastActionText: `${payload.name} created the room!`,
      canRoll: true,
      movableTokens: [],
      lastDiceValue: null,
      lastDiceColor: null,
    };

    this.rooms.set(roomId, room);
    this.codeToRoomId.set(code.toUpperCase(), roomId);
    return room;
  }

  joinRoom(payload: JoinLudoRoomPayload): LudoGameState {
    const roomId = this.codeToRoomId.get(payload.code.toUpperCase());
    if (!roomId) throw new Error("Ludo room not found");

    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Ludo room no longer exists");

    const existing = room.players.find((p) => p.userId === payload.userId);
    if (existing) return room;

    if (room.players.length >= room.maxPlayers) {
      throw new Error(`Room is full (max ${room.maxPlayers} players)`);
    }

    // Pick first available color
    const takenColors = new Set(room.players.map((p) => p.color));
    const availableColor =
      payload.color && !takenColors.has(payload.color)
        ? payload.color
        : ALL_COLORS.find((c) => !takenColors.has(c)) || "GREEN";

    const newPlayer: LudoPlayer = {
      id: `p-${payload.userId}`,
      userId: payload.userId,
      name: payload.name,
      username: payload.username,
      color: availableColor,
      tokens: createTokens(availableColor),
      hasFinished: false,
      consecutiveSixes: 0,
    };

    room.players.push(newPlayer);
    room.lastActionText = `${payload.name} joined as ${availableColor}!`;
    return room;
  }

  addBot(payload: AddLudoBotPayload): LudoGameState {
    const room = this.rooms.get(payload.roomId);
    if (!room) throw new Error("Room not found");
    if (room.players.length >= room.maxPlayers) throw new Error("Room is full");

    const takenColors = new Set(room.players.map((p) => p.color));
    const botColor = payload.color || ALL_COLORS.find((c) => !takenColors.has(c)) || "BLUE";
    const botIndex = room.players.filter((p) => p.isBot).length + 1;

    const botPlayer: LudoPlayer = {
      id: `bot-${Date.now()}-${botIndex}`,
      userId: `bot-${botIndex}`,
      name: `Bot ${botIndex} 🤖`,
      username: `bot${botIndex}`,
      color: botColor,
      isBot: true,
      tokens: createTokens(botColor),
      hasFinished: false,
      consecutiveSixes: 0,
    };

    room.players.push(botPlayer);
    room.lastActionText = `Bot ${botIndex} joined as ${botColor}!`;
    return room;
  }

  startGame(roomId: string, io: SocketIOServer<any, any>): LudoGameState {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.players.length < 2) throw new Error("Need at least 2 players or bots to start");

    room.status = "playing";
    room.currentTurnColor = room.players[0].color;
    room.diceValue = null;
    room.lastDiceValue = null;
    room.lastDiceColor = null;
    room.hasRolled = false;
    room.canRoll = true;
    room.movableTokens = [];
    room.lastActionText = `Game started! ${room.players[0].name}'s turn to roll!`;

    io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
    return room;
  }

  rollDice(payload: RollLudoDicePayload, io: SocketIOServer<any, any>): { value: number; canMove: boolean; room: LudoGameState } {
    const room = this.rooms.get(payload.roomId);
    if (!room) throw new Error("Room not found");
    if (room.status !== "playing") throw new Error("Game is not active");

    const currentPlayer = room.players.find((p) => p.color === room.currentTurnColor);
    if (!currentPlayer) throw new Error("Player not found");
    if (!currentPlayer.isBot && currentPlayer.userId !== payload.userId) {
      throw new Error("Not your turn to roll!");
    }
    if (room.hasRolled) throw new Error("Already rolled, select a token to move!");

    // Fair dice roll 1..6
    const diceValue = Math.floor(Math.random() * 6) + 1;
    room.diceValue = diceValue;
    room.lastDiceValue = diceValue;
    room.lastDiceColor = currentPlayer.color;
    room.hasRolled = true;
    room.canRoll = false;

    if (diceValue === 6) {
      currentPlayer.consecutiveSixes += 1;
    } else {
      currentPlayer.consecutiveSixes = 0;
    }

    // Penalty for 3 consecutive sixes
    if (currentPlayer.consecutiveSixes >= 3) {
      room.lastActionText = `${currentPlayer.name} rolled three 6s in a row! Turn skipped!`;
      currentPlayer.consecutiveSixes = 0;
      this.advanceTurn(room);
      io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
      return { value: diceValue, canMove: false, room };
    }

    const config = getLudoConfig(room.maxPlayers);

    // Determine movable tokens
    const movable: number[] = [];
    for (const token of currentPlayer.tokens) {
      if (token.isHome) continue;
      if (token.inYard) {
        if (diceValue === 6) movable.push(token.id);
      } else {
        // Token is on track or home stretch
        if (token.step + diceValue <= config.winStep) {
          movable.push(token.id);
        }
      }
    }

    room.movableTokens = movable;

    if (movable.length === 0) {
      room.lastActionText = `${currentPlayer.name} rolled a ${diceValue} (no moves possible).`;
      this.advanceTurn(room);
    } else {
      room.lastActionText = `${currentPlayer.name} rolled a ${diceValue}! Choose a token.`;
    }

    io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
    io.to(`ludo:${room.roomId}`).emit("ludo:diceRolled", {
      color: currentPlayer.color,
      value: diceValue,
      canMove: movable.length > 0,
    });

    return { value: diceValue, canMove: movable.length > 0, room };
  }

  moveToken(payload: MoveLudoTokenPayload, io: SocketIOServer<any, any>): LudoGameState {
    const room = this.rooms.get(payload.roomId);
    if (!room) throw new Error("Room not found");
    if (!room.hasRolled || room.diceValue === null) throw new Error("Must roll dice first");

    const currentPlayer = room.players.find((p) => p.color === room.currentTurnColor);
    if (!currentPlayer) throw new Error("Player not found");
    if (!currentPlayer.isBot && currentPlayer.userId !== payload.userId) {
      throw new Error("Not your turn to move!");
    }

    const token = currentPlayer.tokens.find((t) => t.id === payload.tokenId);
    if (!token) throw new Error("Token not found");
    if (!room.movableTokens.includes(payload.tokenId)) {
      throw new Error("This token cannot move right now");
    }

    const config = getLudoConfig(room.maxPlayers);
    let isBonusRoll = false;

    if (token.inYard) {
      // Releasing from yard onto start square
      token.inYard = false;
      token.step = 0;
      room.lastActionText = `${currentPlayer.name} deployed a token to the track!`;
      isBonusRoll = true; // Rolling 6 gives bonus roll
    } else {
      token.step += room.diceValue;

      if (token.step === config.winStep) {
        token.isHome = true;
        room.lastActionText = `🎉 ${currentPlayer.name} scored a token in HOME!`;
        isBonusRoll = true; // Reaching home gives bonus roll

        // Check if player won
        if (currentPlayer.tokens.every((t) => t.isHome)) {
          currentPlayer.hasFinished = true;
          currentPlayer.rank = room.winnerList.length + 1;
          room.winnerList.push({
            color: currentPlayer.color,
            name: currentPlayer.name,
            rank: currentPlayer.rank,
          });
          room.lastActionText = `🏆 ${currentPlayer.name} finished in Rank #${currentPlayer.rank}!`;

          // Check if game over (only 1 player remains)
          const remaining = room.players.filter((p) => !p.hasFinished);
          if (remaining.length <= 1) {
            room.status = "game_over";
          }
        }
      } else if (token.step < config.outerTrackLimit) {
        // Check for capture on outer track
        const actualTile = (config.offsets[currentPlayer.color] + token.step) % config.trackLength;
        const isSafeTile = config.safeTiles.includes(actualTile);

        if (!isSafeTile) {
          for (const otherPlayer of room.players) {
            if (otherPlayer.color === currentPlayer.color) continue;
            for (const otherToken of otherPlayer.tokens) {
              if (otherToken.inYard || otherToken.isHome || otherToken.step >= config.outerTrackLimit) continue;
              const otherActualTile =
                (config.offsets[otherPlayer.color] + otherToken.step) % config.trackLength;

              if (otherActualTile === actualTile) {
                // CAPTURE!
                otherToken.step = -1;
                otherToken.inYard = true;
                room.lastActionText = `💥 ${currentPlayer.name} captured ${otherPlayer.name}'s token!`;
                isBonusRoll = true;
                break;
              }
            }
          }
        }
      }
    }

    if (room.diceValue === 6) {
      isBonusRoll = true;
    }

    io.to(`ludo:${room.roomId}`).emit("ludo:tokenMoved", {
      color: currentPlayer.color,
      tokenId: token.id,
      step: token.step,
      isHome: token.isHome,
    });

    if (isBonusRoll && !currentPlayer.hasFinished) {
      room.hasRolled = false;
      room.canRoll = true;
      room.diceValue = null;
      room.movableTokens = [];
      room.lastActionText += " (Bonus Roll!)";
    } else {
      this.advanceTurn(room);
    }

    io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
    return room;
  }

  private advanceTurn(room: LudoGameState) {
    room.hasRolled = false;
    room.canRoll = true;
    room.diceValue = null;
    room.movableTokens = [];

    const activePlayers = room.players.filter((p) => !p.hasFinished);
    if (activePlayers.length <= 1) {
      room.status = "game_over";
      return;
    }

    const currentIndex = room.players.findIndex((p) => p.color === room.currentTurnColor);
    let nextIndex = (currentIndex + 1) % room.players.length;

    while (room.players[nextIndex].hasFinished) {
      nextIndex = (nextIndex + 1) % room.players.length;
    }

    room.currentTurnColor = room.players[nextIndex].color;
  }

  resetRoom(roomId: string, io: SocketIOServer<any, any>): LudoGameState {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    for (const player of room.players) {
      player.tokens = createTokens(player.color);
      player.hasFinished = false;
      player.rank = undefined;
      player.consecutiveSixes = 0;
    }

    room.status = "playing";
    room.currentTurnColor = room.players[0].color;
    room.winnerList = [];
    room.hasRolled = false;
    room.canRoll = true;
    room.diceValue = null;
    room.lastDiceValue = null;
    room.lastDiceColor = null;
    room.movableTokens = [];
    room.lastActionText = "Game reset! Ready to play.";

    io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
    return room;
  }

  leaveRoom(roomId: string, userId: string, io: SocketIOServer<any, any>): LudoGameState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const playerIndex = room.players.findIndex((p) => p.userId === userId);
    if (playerIndex === -1) return room;

    const player = room.players[playerIndex];

    if (room.status === "playing") {
      // Exiting an active game counts as a forfeit and loss for that player
      player.hasFinished = true;
      player.isForfeited = true;
      player.rank = room.players.length;
      if (!room.winnerList.some((w) => w.color === player.color)) {
        room.winnerList.push({
          color: player.color,
          name: player.name,
          rank: player.rank,
        });
      }

      const remainingActive = room.players.filter((p) => !p.hasFinished);

      if (remainingActive.length <= 1) {
        if (remainingActive.length === 1) {
          const winner = remainingActive[0];
          winner.hasFinished = true;
          winner.rank = 1;
          if (!room.winnerList.some((w) => w.color === winner.color)) {
            room.winnerList.unshift({
              color: winner.color,
              name: winner.name,
              rank: 1,
            });
          }
          room.lastActionText = `🚪 ${player.name} left (Forfeit). ${winner.name} wins by forfeit!`;
        } else {
          room.lastActionText = `🚪 ${player.name} left (Forfeit). Match ended.`;
        }
        room.status = "game_over";
      } else {
        room.lastActionText = `🚪 ${player.name} left the match (Forfeit / Loss).`;
        if (room.currentTurnColor === player.color) {
          this.advanceTurn(room);
        }
      }

      io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
    } else if (room.status === "waiting") {
      room.players.splice(playerIndex, 1);
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
        this.codeToRoomId.delete(room.code);
        return null;
      }
      if (room.adminId === userId && room.players.length > 0) {
        room.adminId = room.players[0].userId;
      }
      io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
    }

    return room;
  }

  getRoom(roomId: string): LudoGameState | undefined {
    return this.rooms.get(roomId);
  }
}

export const ludoService = new LudoService();
