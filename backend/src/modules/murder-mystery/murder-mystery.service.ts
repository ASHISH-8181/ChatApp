import { prisma } from "../../db/prisma.js";
import type {
  MMRole,
  MMPhase,
  MMRoomState,
  MMPlayerInfo,
  MMMessage,
  MMHistoryItem,
  CreateMMRoomPayload,
  JoinMMRoomPayload,
  ToggleMMReadyPayload,
  StartMMGamePayload,
  ViewedMMRolePayload,
  MMMurdererActionPayload,
  MMHealerActionPayload,
  MMCastVotePayload,
  MMSendMessagePayload,
} from "@chatapp/shared";

// In-memory action buffers for current active phase actions (speed & simplicity)
const nightActions = new Map<string, Map<string, string>>(); // roomId -> (murdererUserId -> targetUserId)
const healerActions = new Map<string, Map<string, string>>(); // roomId -> (healerUserId -> targetUserId)
const runoffTies = new Map<string, string[]>(); // roomId -> tied candidate userIds

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "MM";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class MurderMysteryService {
  /**
   * Sanitizes the full room object so that private roles and secret actions
   * are never exposed to clients who should not see them.
   */
  async getSanitizedRoomState(roomId: string, viewingUserId: string): Promise<MMRoomState> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        players: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
        history: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
        votes: {
          where: { round: { equals: prisma.murderMysteryRoom.fields ? undefined : undefined } },
        },
      },
    });

    const isGameOver = room.status === "GAME_OVER";
    const myPlayer = room.players.find((p) => p.userId === viewingUserId);
    const myRole = myPlayer?.role as MMRole | undefined;

    // Current votes for progress display
    const currentRoundVotes = await prisma.murderMysteryVote.findMany({
      where: {
        roomId: room.id,
        round: room.phaseRound,
        isRunoff: room.status === "RUNOFF_VOTING",
      },
    });
    const votedUserIds = new Set(currentRoundVotes.map((v) => v.voterId));

    // Player infos
    const players: MMPlayerInfo[] = room.players.map((p) => {
      const isMe = p.userId === viewingUserId;
      // Show role only if: game is over, or it's me, or player was eliminated by vote
      let roleToShow: MMRole | undefined = undefined;
      if (isGameOver || isMe || (p.eliminatedReason === "VOTE" && !p.isAlive)) {
        roleToShow = (p.role as MMRole) || undefined;
      }

      return {
        id: p.id,
        userId: p.userId,
        name: p.name,
        username: p.username,
        isReady: p.isReady,
        role: roleToShow,
        isAlive: p.isAlive,
        eliminatedAt: p.eliminatedAt?.toISOString(),
        eliminatedReason: (p.eliminatedReason as "NIGHT" | "VOTE") || undefined,
        eliminatedRound: p.eliminatedRound || undefined,
        hasViewedRole: p.hasViewedRole,
        hasVoted: votedUserIds.has(p.userId),
      };
    });

    let phaseTimeRemaining: number | undefined = undefined;
    if (room.phaseExpiresAt) {
      const diffMs = room.phaseExpiresAt.getTime() - Date.now();
      phaseTimeRemaining = Math.max(0, Math.ceil(diffMs / 1000));
    }

    let eliminatedInVoting: { id: string; name: string; role: MMRole } | undefined = undefined;
    if (room.eliminatedInVoting) {
      const elimPlayer = room.players.find((p) => p.userId === room.eliminatedInVoting);
      if (elimPlayer) {
        eliminatedInVoting = {
          id: elimPlayer.userId,
          name: elimPlayer.name,
          role: (room.eliminatedRole as MMRole) || (elimPlayer.role as MMRole) || "NORMAL",
        };
      }
    }

    // If voting result phase, calculate vote counts to show
    let voteCounts: Record<string, number> | undefined = undefined;
    if (room.status === "VOTING_RESULT" || isGameOver) {
      voteCounts = {};
      for (const v of currentRoundVotes) {
        voteCounts[v.targetId] = (voteCounts[v.targetId] || 0) + 1;
      }
    }

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      adminId: room.adminId,
      numMurderers: room.numMurderers,
      numHealers: room.numHealers,
      votingDuration: room.votingDuration,
      status: room.status as MMPhase,
      phaseRound: room.phaseRound,
      phaseExpiresAt: room.phaseExpiresAt?.toISOString(),
      phaseTimeRemaining,
      players,
      myRole,
      myPlayerId: myPlayer?.id,
      eliminatedTonight: room.eliminatedTonight,
      eliminatedInVoting,
      winnerTeam: (room.winnerTeam as "INNOCENTS" | "MURDERERS") || undefined,
      initialPlayerCount: room.initialPlayerCount,
      messages: room.messages.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        senderName: m.senderName,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      })),
      history: room.history.map((h) => ({
        id: h.id,
        round: h.round,
        phase: h.phase,
        description: h.description,
        createdAt: h.createdAt.toISOString(),
      })),
      runoffCandidates: runoffTies.get(room.id),
      voteCounts,
    };
  }

  /**
   * Broadcasts sanitized state to all players connected to room socket
   */
  async broadcastRoomState(roomId: string, io: any): Promise<void> {
    if (!io) return;
    const room = await prisma.murderMysteryRoom.findUnique({
      where: { id: roomId },
      include: { players: true },
    });
    if (!room) return;

    for (const player of room.players) {
      try {
        const state = await this.getSanitizedRoomState(roomId, player.userId);
        io.to(`mm:user:${player.userId}`).emit("mm:state", state);
      } catch (err) {
        console.error(`Error broadcasting state to player ${player.userId}:`, err);
      }
    }
  }

  /**
   * 1. Create a Murder Mystery Room
   */
  async createRoom(payload: CreateMMRoomPayload): Promise<MMRoomState> {
    const { adminId, name, numMurderers, numHealers, votingDuration } = payload;
    if (numMurderers < 1) {
      throw new Error("Game must have at least 1 murderer.");
    }
    if (numMurderers !== numHealers) {
      throw new Error("Number of murderers and healers must always be equal.");
    }
    const cleanVotingDuration = Math.max(15, Math.min(votingDuration || 60, 300));

    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });

    // Generate unique room code
    let code = generateRoomCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.murderMysteryRoom.findUnique({ where: { code } });
      if (!existing) break;
      code = generateRoomCode();
      attempts++;
    }

    const cleanName = name?.trim() || "Murder Mystery Room";

    const room = await prisma.murderMysteryRoom.create({
      data: {
        code,
        name: cleanName,
        adminId,
        numMurderers,
        numHealers,
        votingDuration: cleanVotingDuration,
        status: "LOBBY",
        players: {
          create: [
            {
              userId: adminId,
              name: admin.name,
              username: admin.username,
              isReady: false,
              isAlive: true,
            },
          ],
        },
        history: {
          create: [
            {
              round: 1,
              phase: "LOBBY",
              description: `Room created by ${admin.name}. Waiting for players to join with code ${code}.`,
            },
          ],
        },
      },
    });

    return this.getSanitizedRoomState(room.id, adminId);
  }

  /**
   * 2. Join Room via Code
   */
  async joinRoom(payload: JoinMMRoomPayload): Promise<MMRoomState> {
    const cleanCode = payload.code.trim().toUpperCase();
    const room = await prisma.murderMysteryRoom.findUnique({
      where: { code: cleanCode },
      include: { players: true },
    });

    if (!room) {
      throw new Error(`Room with code "${cleanCode}" was not found.`);
    }

    if (room.status !== "LOBBY") {
      // If player already in game, let them reconnect!
      const isAlreadyIn = room.players.some((p) => p.userId === payload.userId);
      if (isAlreadyIn) {
        return this.getSanitizedRoomState(room.id, payload.userId);
      }
      throw new Error("This game has already started. New players cannot join.");
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.userId } });

    // Upsert player in room
    await prisma.murderMysteryPlayer.upsert({
      where: { roomId_userId: { roomId: room.id, userId: payload.userId } },
      update: {
        name: user.name,
        username: user.username,
      },
      create: {
        roomId: room.id,
        userId: payload.userId,
        name: user.name,
        username: user.username,
        isReady: false,
        isAlive: true,
      },
    });

    return this.getSanitizedRoomState(room.id, payload.userId);
  }

  /**
   * 3. Toggle Ready status
   */
  async toggleReady(payload: ToggleMMReadyPayload, io?: any): Promise<MMRoomState> {
    const { roomId, userId, isReady } = payload;
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({ where: { id: roomId } });

    if (room.status !== "LOBBY") {
      throw new Error("Cannot change ready status while game is active.");
    }

    await prisma.murderMysteryPlayer.update({
      where: { roomId_userId: { roomId, userId } },
      data: { isReady },
    });

    await this.broadcastRoomState(roomId, io);
    return this.getSanitizedRoomState(roomId, userId);
  }

  /**
   * 4. Start Game (Admin only, all ready, role distribution)
   */
  async startGame(payload: StartMMGamePayload, io?: any): Promise<MMRoomState> {
    const { roomId, userId } = payload;
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    if (room.adminId !== userId) {
      throw new Error("Only the Room Admin can start the game.");
    }

    if (room.status !== "LOBBY") {
      throw new Error("Game has already started.");
    }

    // Verify readiness
    const notReadyPlayers = room.players.filter((p) => !p.isReady);
    if (notReadyPlayers.length > 0) {
      throw new Error(
        `Cannot start: ${notReadyPlayers.length} player(s) are not ready yet.`
      );
    }

    // Minimum player check: numMurderers + numHealers + at least 1 Normal
    const minRequired = room.numMurderers + room.numHealers + 1;
    if (room.players.length < minRequired) {
      throw new Error(
        `Need at least ${minRequired} players for ${room.numMurderers} murderer(s), ${room.numHealers} healer(s), and at least 1 Normal player.`
      );
    }

    // Shuffle and assign roles
    const shuffled = [...room.players].sort(() => Math.random() - 0.5);

    const assignments: { playerId: string; role: MMRole }[] = [];
    for (let i = 0; i < shuffled.length; i++) {
      if (i < room.numMurderers) {
        assignments.push({ playerId: shuffled[i].id, role: "MURDERER" });
      } else if (i < room.numMurderers + room.numHealers) {
        assignments.push({ playerId: shuffled[i].id, role: "HEALER" });
      } else {
        assignments.push({ playerId: shuffled[i].id, role: "NORMAL" });
      }
    }

    // Update players in DB
    await prisma.$transaction(
      assignments.map((a) =>
        prisma.murderMysteryPlayer.update({
          where: { id: a.playerId },
          data: {
            role: a.role,
            isAlive: true,
            hasViewedRole: false,
            eliminatedAt: null,
            eliminatedReason: null,
            eliminatedRound: null,
          },
        })
      )
    );

    // Update room state to ROLE_REVEAL with 25s countdown
    const expiresAt = new Date(Date.now() + 25000);
    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        status: "ROLE_REVEAL",
        phaseRound: 1,
        phaseExpiresAt: expiresAt,
        initialPlayerCount: room.players.length,
        winnerTeam: null,
        nightTargetIds: [],
        healerTargetIds: [],
        eliminatedTonight: [],
        eliminatedInVoting: null,
        eliminatedRole: null,
      },
    });

    await prisma.murderMysteryHistory.create({
      data: {
        roomId,
        round: 1,
        phase: "ROLE_REVEAL",
        description: `Game started with ${room.players.length} players. Roles assigned secretly.`,
      },
    });

    // Clear any buffers
    nightActions.delete(roomId);
    healerActions.delete(roomId);
    runoffTies.delete(roomId);

    await this.broadcastRoomState(roomId, io);
    return this.getSanitizedRoomState(roomId, userId);
  }

  /**
   * 5. Player Acknowledged Role Screen
   */
  async viewedRole(payload: ViewedMMRolePayload, io?: any): Promise<void> {
    const { roomId, userId } = payload;
    await prisma.murderMysteryPlayer.update({
      where: { roomId_userId: { roomId, userId } },
      data: { hasViewedRole: true },
    });

    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    if (room.status === "ROLE_REVEAL") {
      const allViewed = room.players.every((p) => p.hasViewedRole);
      if (allViewed) {
        await this.startNightPhase(roomId, io);
      } else {
        await this.broadcastRoomState(roomId, io);
      }
    }
  }

  /**
   * 6. Start Night Phase
   */
  async startNightPhase(roomId: string, io?: any): Promise<void> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({ where: { id: roomId } });
    const expiresAt = new Date(Date.now() + 45000); // 45 seconds to choose kill

    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        status: "NIGHT_PHASE",
        phaseExpiresAt: expiresAt,
        nightTargetIds: [],
        healerTargetIds: [],
        eliminatedTonight: [],
        eliminatedInVoting: null,
        eliminatedRole: null,
      },
    });

    nightActions.set(roomId, new Map());

    await prisma.murderMysteryHistory.create({
      data: {
        roomId,
        round: room.phaseRound,
        phase: "NIGHT_PHASE",
        description: `Round ${room.phaseRound}: Night fell upon the town. Murderers are stalking their prey.`,
      },
    });

    await this.broadcastRoomState(roomId, io);
  }

  /**
   * 7. Murderer Action (Secret Night Selection)
   */
  async submitMurdererAction(payload: MMMurdererActionPayload, io?: any): Promise<void> {
    const { roomId, userId, targetUserId } = payload;
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    if (room.status !== "NIGHT_PHASE") {
      throw new Error("Night action can only be submitted during the Night phase.");
    }

    const murderer = room.players.find((p) => p.userId === userId);
    if (!murderer || murderer.role !== "MURDERER" || !murderer.isAlive) {
      throw new Error("Only living Murderers can choose a victim.");
    }

    if (targetUserId === userId) {
      throw new Error("Murderers cannot target themselves.");
    }

    const target = room.players.find((p) => p.userId === targetUserId);
    if (!target || !target.isAlive) {
      throw new Error("Target must be a living player.");
    }

    // Save murderer choice in memory buffer
    let actions = nightActions.get(roomId);
    if (!actions) {
      actions = new Map();
      nightActions.set(roomId, actions);
    }
    actions.set(userId, targetUserId);

    // Check if all living murderers have submitted
    const livingMurderers = room.players.filter((p) => p.role === "MURDERER" && p.isAlive);
    const allSubmitted = livingMurderers.every((m) => actions?.has(m.userId));

    if (allSubmitted) {
      await this.startHealerPhase(roomId, io);
    }
  }

  /**
   * 8. Start Healer Phase
   */
  async startHealerPhase(roomId: string, io?: any): Promise<void> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    // Check if there are any living healers
    const livingHealers = room.players.filter((p) => p.role === "HEALER" && p.isAlive);
    if (livingHealers.length === 0) {
      // Skip healer phase directly to resolve night!
      await this.resolveNight(roomId, io);
      return;
    }

    const expiresAt = new Date(Date.now() + 35000); // 35 seconds to heal
    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        status: "HEALER_PHASE",
        phaseExpiresAt: expiresAt,
      },
    });

    healerActions.set(roomId, new Map());

    await prisma.murderMysteryHistory.create({
      data: {
        roomId,
        round: room.phaseRound,
        phase: "HEALER_PHASE",
        description: `Round ${room.phaseRound}: Healers awaken to protect a life.`,
      },
    });

    await this.broadcastRoomState(roomId, io);
  }

  /**
   * 9. Healer Action (Secret Protection)
   */
  async submitHealerAction(payload: MMHealerActionPayload, io?: any): Promise<void> {
    const { roomId, userId, targetUserId } = payload;
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    if (room.status !== "HEALER_PHASE") {
      throw new Error("Healing can only be submitted during the Healer phase.");
    }

    const healer = room.players.find((p) => p.userId === userId);
    if (!healer || healer.role !== "HEALER" || !healer.isAlive) {
      throw new Error("Only living Healers can protect a player.");
    }

    const target = room.players.find((p) => p.userId === targetUserId);
    if (!target || !target.isAlive) {
      throw new Error("Target must be a living player.");
    }

    let actions = healerActions.get(roomId);
    if (!actions) {
      actions = new Map();
      healerActions.set(roomId, actions);
    }
    actions.set(userId, targetUserId);

    const livingHealers = room.players.filter((p) => p.role === "HEALER" && p.isAlive);
    const allSubmitted = livingHealers.every((h) => actions?.has(h.userId));

    if (allSubmitted) {
      await this.resolveNight(roomId, io);
    }
  }

  /**
   * 10. Resolve Night (Combine murders and protections)
   */
  async resolveNight(roomId: string, io?: any): Promise<void> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    const mActions = nightActions.get(roomId) || new Map();
    const hActions = healerActions.get(roomId) || new Map();

    const targetedIds = Array.from(new Set(mActions.values()));
    const protectedIds = new Set(hActions.values());

    // A targeted player is saved if protected by at least one healer
    const eliminatedUserIds: string[] = [];
    for (const targetId of targetedIds) {
      if (!protectedIds.has(targetId)) {
        eliminatedUserIds.push(targetId);
      }
    }

    const eliminatedNames: string[] = [];
    if (eliminatedUserIds.length > 0) {
      const now = new Date();
      await prisma.$transaction(
        eliminatedUserIds.map((userId) =>
          prisma.murderMysteryPlayer.update({
            where: { roomId_userId: { roomId, userId } },
            data: {
              isAlive: false,
              eliminatedAt: now,
              eliminatedReason: "NIGHT",
              eliminatedRound: room.phaseRound,
            },
          })
        )
      );

      for (const uid of eliminatedUserIds) {
        const p = room.players.find((x) => x.userId === uid);
        if (p) eliminatedNames.push(p.name);
      }
    }

    const expiresAt = new Date(Date.now() + 8000); // 8s result reveal
    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        status: "NIGHT_RESULT",
        phaseExpiresAt: expiresAt,
        eliminatedTonight: eliminatedNames,
      },
    });

    const histDesc =
      eliminatedNames.length > 0
        ? `Night fell: ${eliminatedNames.join(", ")} was eliminated.`
        : "Morning broke: Everyone survived the night!";

    await prisma.murderMysteryHistory.create({
      data: {
        roomId,
        round: room.phaseRound,
        phase: "NIGHT_RESULT",
        description: histDesc,
      },
    });

    // Emit night result event
    if (io) {
      io.to(`mm:${roomId}`).emit("mm:nightResult", {
        eliminatedNames,
        everyoneSurvived: eliminatedNames.length === 0,
      });
    }

    // Check Win Condition immediately after night kills
    const updatedRoom = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    const winResult = this.checkWinCondition(updatedRoom);
    if (winResult) {
      await this.endGame(roomId, winResult, io);
      return;
    }

    await this.broadcastRoomState(roomId, io);
  }

  /**
   * 11. Start Discussion and Voting Phase
   */
  async startVotingPhase(roomId: string, io?: any): Promise<void> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({ where: { id: roomId } });
    const expiresAt = new Date(Date.now() + room.votingDuration * 1000);

    // Delete any old votes for current round
    await prisma.murderMysteryVote.deleteMany({
      where: { roomId, round: room.phaseRound },
    });

    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        status: "VOTING",
        phaseExpiresAt: expiresAt,
      },
    });

    runoffTies.delete(roomId);

    await prisma.murderMysteryHistory.create({
      data: {
        roomId,
        round: room.phaseRound,
        phase: "VOTING",
        description: `Round ${room.phaseRound}: Voting begins! Town has ${room.votingDuration}s to cast votes.`,
      },
    });

    await this.broadcastRoomState(roomId, io);
  }

  /**
   * 12. Cast Vote
   */
  async castVote(payload: MMCastVotePayload, io?: any): Promise<void> {
    const { roomId, userId, targetUserId } = payload;
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    const isRunoff = room.status === "RUNOFF_VOTING";
    if (room.status !== "VOTING" && !isRunoff) {
      throw new Error("Voting is not active.");
    }

    const voter = room.players.find((p) => p.userId === userId);
    if (!voter || !voter.isAlive) {
      throw new Error("Only living players can vote.");
    }

    if (userId === targetUserId) {
      throw new Error("Players cannot vote for themselves.");
    }

    const target = room.players.find((p) => p.userId === targetUserId);
    if (!target || !target.isAlive) {
      throw new Error("Target must be a living player.");
    }

    if (isRunoff) {
      const ties = runoffTies.get(roomId) || [];
      if (!ties.includes(targetUserId)) {
        throw new Error("In runoff voting, you must vote for one of the tied candidates.");
      }
    }

    // Upsert vote
    await prisma.murderMysteryVote.upsert({
      where: {
        roomId_round_voterId_isRunoff: {
          roomId,
          round: room.phaseRound,
          voterId: userId,
          isRunoff,
        },
      },
      update: { targetId: targetUserId },
      create: {
        roomId,
        round: room.phaseRound,
        voterId: userId,
        targetId: targetUserId,
        isRunoff,
      },
    });

    // Check if all living players have voted
    const livingPlayers = room.players.filter((p) => p.isAlive);
    const votes = await prisma.murderMysteryVote.findMany({
      where: { roomId, round: room.phaseRound, isRunoff },
    });

    if (votes.length >= livingPlayers.length) {
      await this.resolveVoting(roomId, isRunoff, io);
    } else {
      await this.broadcastRoomState(roomId, io);
    }
  }

  /**
   * 13. Resolve Voting (Highest votes eliminated; tie handles runoff)
   */
  async resolveVoting(roomId: string, isRunoff: boolean, io?: any): Promise<void> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    const votes = await prisma.murderMysteryVote.findMany({
      where: { roomId, round: room.phaseRound, isRunoff },
    });

    const tally: Record<string, number> = {};
    for (const v of votes) {
      tally[v.targetId] = (tally[v.targetId] || 0) + 1;
    }

    let maxVotes = 0;
    for (const count of Object.values(tally)) {
      if (count > maxVotes) maxVotes = count;
    }

    const tiedCandidates = Object.keys(tally).filter((uid) => tally[uid] === maxVotes);

    // Case 1: Tie for highest votes
    if (tiedCandidates.length > 1 && maxVotes > 0) {
      if (!isRunoff) {
        // Conduct short runoff vote between tied candidates!
        runoffTies.set(roomId, tiedCandidates);
        const expiresAt = new Date(Date.now() + 30000); // 30s runoff timer

        await prisma.murderMysteryRoom.update({
          where: { id: roomId },
          data: {
            status: "RUNOFF_VOTING",
            phaseExpiresAt: expiresAt,
          },
        });

        const tiedNames = tiedCandidates
          .map((id) => room.players.find((p) => p.userId === id)?.name || id)
          .join(" vs ");

        await prisma.murderMysteryHistory.create({
          data: {
            roomId,
            round: room.phaseRound,
            phase: "RUNOFF_VOTING",
            description: `Voting was tied! Runoff vote between: ${tiedNames}.`,
          },
        });

        if (io) {
          io.to(`mm:${roomId}`).emit("mm:votingResult", {
            isTie: true,
            isRunoff: true,
          });
        }

        await this.broadcastRoomState(roomId, io);
        return;
      } else {
        // Runoff was also tied! Nobody eliminated
        const expiresAt = new Date(Date.now() + 6000);
        await prisma.murderMysteryRoom.update({
          where: { id: roomId },
          data: {
            status: "VOTING_RESULT",
            phaseExpiresAt: expiresAt,
            eliminatedInVoting: null,
            eliminatedRole: null,
          },
        });

        runoffTies.delete(roomId);

        await prisma.murderMysteryHistory.create({
          data: {
            roomId,
            round: room.phaseRound,
            phase: "VOTING_RESULT",
            description: "Runoff vote was also tied. Nobody was eliminated by the town.",
          },
        });

        if (io) {
          io.to(`mm:${roomId}`).emit("mm:votingResult", {
            isTie: true,
            isRunoff: false,
          });
        }

        await this.broadcastRoomState(roomId, io);
        return;
      }
    }

    // Case 2: Clear single eliminated player (or 0 votes)
    if (tiedCandidates.length === 1 && maxVotes > 0) {
      const eliminatedId = tiedCandidates[0];
      const elimPlayer = room.players.find((p) => p.userId === eliminatedId);

      if (elimPlayer) {
        const now = new Date();
        await prisma.murderMysteryPlayer.update({
          where: { id: elimPlayer.id },
          data: {
            isAlive: false,
            eliminatedAt: now,
            eliminatedReason: "VOTE",
            eliminatedRound: room.phaseRound,
          },
        });

        const expiresAt = new Date(Date.now() + 7000);
        await prisma.murderMysteryRoom.update({
          where: { id: roomId },
          data: {
            status: "VOTING_RESULT",
            phaseExpiresAt: expiresAt,
            eliminatedInVoting: elimPlayer.userId,
            eliminatedRole: elimPlayer.role,
          },
        });

        runoffTies.delete(roomId);

        await prisma.murderMysteryHistory.create({
          data: {
            roomId,
            round: room.phaseRound,
            phase: "VOTING_RESULT",
            description: `Town voted to eliminate ${elimPlayer.name} with ${maxVotes} votes! Role revealed: ${elimPlayer.role}.`,
          },
        });

        if (io) {
          io.to(`mm:${roomId}`).emit("mm:votingResult", {
            eliminatedPlayer: {
              id: elimPlayer.userId,
              name: elimPlayer.name,
              role: elimPlayer.role as MMRole,
            },
            isTie: false,
            isRunoff: false,
          });
        }

        // Check win condition
        const updatedRoom = await prisma.murderMysteryRoom.findUniqueOrThrow({
          where: { id: roomId },
          include: { players: true },
        });

        const winResult = this.checkWinCondition(updatedRoom);
        if (winResult) {
          await this.endGame(roomId, winResult, io);
          return;
        }

        await this.broadcastRoomState(roomId, io);
        return;
      }
    }

    // No votes cast
    const expiresAt = new Date(Date.now() + 6000);
    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        status: "VOTING_RESULT",
        phaseExpiresAt: expiresAt,
        eliminatedInVoting: null,
        eliminatedRole: null,
      },
    });

    await prisma.murderMysteryHistory.create({
      data: {
        roomId,
        round: room.phaseRound,
        phase: "VOTING_RESULT",
        description: "No votes were cast. Nobody was eliminated.",
      },
    });

    await this.broadcastRoomState(roomId, io);
  }

  /**
   * 14. Win Conditions
   * Innocents win: All murderers eliminated (livingMurderers === 0).
   * Murderers win: >= 50% of initial starting players eliminated while >= 1 murderer alive.
   */
  checkWinCondition(room: any): "INNOCENTS" | "MURDERERS" | null {
    const livingMurderers = room.players.filter((p: any) => p.role === "MURDERER" && p.isAlive);
    const totalOriginal = room.initialPlayerCount || room.players.length;
    const eliminatedTotal = room.players.filter((p: any) => !p.isAlive).length;

    if (livingMurderers.length === 0) {
      return "INNOCENTS";
    }

    const halfThreshold = Math.ceil(totalOriginal / 2);
    if (eliminatedTotal >= halfThreshold && livingMurderers.length > 0) {
      return "MURDERERS";
    }

    return null;
  }

  /**
   * 15. Game Over
   */
  async endGame(roomId: string, winnerTeam: "INNOCENTS" | "MURDERERS", io?: any): Promise<void> {
    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        status: "GAME_OVER",
        winnerTeam,
        phaseExpiresAt: null,
      },
    });

    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true, history: true },
    });

    const desc =
      winnerTeam === "INNOCENTS"
        ? "🏆 VICTORY FOR THE INNOCENTS! All Murderers have been brought to justice."
        : "🩸 VICTORY FOR THE MURDERERS! The murderers have overpowered the town.";

    await prisma.murderMysteryHistory.create({
      data: {
        roomId,
        round: room.phaseRound,
        phase: "GAME_OVER",
        description: desc,
      },
    });

    const rolesMap: Record<string, MMRole> = {};
    for (const p of room.players) {
      if (p.role) rolesMap[p.userId] = p.role as MMRole;
    }

    if (io) {
      io.to(`mm:${roomId}`).emit("mm:gameOver", {
        winnerTeam,
        roles: rolesMap,
        history: room.history.map((h) => ({
          id: h.id,
          round: h.round,
          phase: h.phase,
          description: h.description,
          createdAt: h.createdAt.toISOString(),
        })),
      });
    }

    await this.broadcastRoomState(roomId, io);
  }

  /**
   * 16. Advance to Next Round
   */
  async advanceNextRound(roomId: string, io?: any): Promise<void> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({ where: { id: roomId } });
    if (room.status === "GAME_OVER") return;

    await prisma.murderMysteryRoom.update({
      where: { id: roomId },
      data: {
        phaseRound: room.phaseRound + 1,
      },
    });

    await this.startNightPhase(roomId, io);
  }

  /**
   * 17. Play Again (Reset Room to Lobby)
   */
  async playAgain(roomId: string, userId: string, io?: any): Promise<MMRoomState> {
    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });

    if (room.adminId !== userId) {
      throw new Error("Only the Room Admin can restart the game.");
    }

    await prisma.$transaction([
      prisma.murderMysteryPlayer.updateMany({
        where: { roomId },
        data: {
          isReady: false,
          isAlive: true,
          role: null,
          hasViewedRole: false,
          eliminatedAt: null,
          eliminatedReason: null,
          eliminatedRound: null,
        },
      }),
      prisma.murderMysteryRoom.update({
        where: { id: roomId },
        data: {
          status: "LOBBY",
          phaseRound: 1,
          phaseExpiresAt: null,
          winnerTeam: null,
          nightTargetIds: [],
          healerTargetIds: [],
          eliminatedTonight: [],
          eliminatedInVoting: null,
          eliminatedRole: null,
        },
      }),
      prisma.murderMysteryHistory.create({
        data: {
          roomId,
          round: 1,
          phase: "LOBBY",
          description: "Room reset to lobby for a new match.",
        },
      }),
    ]);

    nightActions.delete(roomId);
    healerActions.delete(roomId);
    runoffTies.delete(roomId);

    await this.broadcastRoomState(roomId, io);
    return this.getSanitizedRoomState(roomId, userId);
  }

  /**
   * 18. Discussion Chat Message
   */
  async sendMessage(payload: MMSendMessagePayload, io?: any): Promise<MMMessage> {
    const { roomId, userId, text } = payload;
    const cleanText = text.trim();
    if (!cleanText) throw new Error("Message text cannot be empty.");

    const player = await prisma.murderMysteryPlayer.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!player) throw new Error("You are not a player in this room.");
    if (!player.isAlive) throw new Error("Eliminated players cannot speak in active discussion.");

    const room = await prisma.murderMysteryRoom.findUniqueOrThrow({ where: { id: roomId } });
    if (room.status !== "VOTING" && room.status !== "RUNOFF_VOTING" && room.status !== "LOBBY") {
      // Allowed during discussion & voting phases or lobby
    }

    const msg = await prisma.murderMysteryMessage.create({
      data: {
        roomId,
        senderId: userId,
        senderName: player.name,
        text: cleanText,
      },
    });

    const formatted: MMMessage = {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      text: msg.text,
      createdAt: msg.createdAt.toISOString(),
    };

    if (io) {
      io.to(`mm:${roomId}`).emit("mm:message", formatted);
    }

    return formatted;
  }

  /**
   * 19. Background Phase Auto-Transition Ticker
   * Automatically executes when phase expires (e.g. night timer ended, voting timer ended)
   */
  async checkPhaseTransitions(io?: any): Promise<void> {
    try {
      const now = new Date();
      const expiringRooms = await prisma.murderMysteryRoom.findMany({
        where: {
          phaseExpiresAt: {
            lte: now,
          },
          status: {
            notIn: ["LOBBY", "GAME_OVER"],
          },
        },
        include: { players: true },
      });

      for (const room of expiringRooms) {
        try {
          switch (room.status) {
            case "ROLE_REVEAL":
              // 25s role reveal timeout -> start night
              await this.startNightPhase(room.id, io);
              break;

            case "NIGHT_PHASE":
              // Night action timed out -> advance to healer phase
              await this.startHealerPhase(room.id, io);
              break;

            case "HEALER_PHASE":
              // Healer action timed out -> resolve night
              await this.resolveNight(room.id, io);
              break;

            case "NIGHT_RESULT":
              // 8s night result shown -> advance to voting
              await this.startVotingPhase(room.id, io);
              break;

            case "VOTING":
              // Voting timer expired -> resolve votes
              await this.resolveVoting(room.id, false, io);
              break;

            case "RUNOFF_VOTING":
              // Runoff timer expired -> resolve runoff votes
              await this.resolveVoting(room.id, true, io);
              break;

            case "VOTING_RESULT":
              // 7s voting result shown -> check if won, otherwise next round
              const win = this.checkWinCondition(room);
              if (win) {
                await this.endGame(room.id, win, io);
              } else {
                await this.advanceNextRound(room.id, io);
              }
              break;

            default:
              break;
          }
        } catch (err: any) {
          console.error(`[MM Phase Transition Error room ${room.id}]:`, err.message);
        }
      }
    } catch {
      // Gracefully ignore transient database wake-up / network hiccups in background timer
    }
  }
}

export const murderMysteryService = new MurderMysteryService();
