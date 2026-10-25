import { Server as SocketIOServer, Socket } from "socket.io";
import { messagesService } from "../modules/messages/messages.service.js";
import { murderMysteryService } from "../modules/murder-mystery/murder-mystery.service.js";
import { chessService } from "../modules/chess/chess.service.js";
import { ludoService } from "../modules/ludo/ludo.service.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SendMessagePayload,
  ChatUser,
  MarkReadPayload,
  GameChatMessage,
} from "@chatapp/shared";

// In-memory active presence tracker (userId -> Set of active socket IDs)
const activeUserSockets = new Map<string, Set<string>>();
const socketToUserId = new Map<string, string>();

function getOnlineUserIds(): string[] {
  return Array.from(activeUserSockets.keys());
}

export function registerChatSocket(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  function broadcastPresence() {
    const onlineIds = getOnlineUserIds();
    io.emit("users:presence", onlineIds);
  }

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Send immediate presence list to new socket
    socket.emit("users:presence", getOnlineUserIds());

    // Handle user join with their registered profile
    socket.on("user:join", async (userPayload: ChatUser, callback) => {
      try {
        console.log(`[Socket.IO] User joined: ${userPayload.name} (@${userPayload.username})`);

        // Track user presence
        if (!activeUserSockets.has(userPayload.id)) {
          activeUserSockets.set(userPayload.id, new Set());
        }
        activeUserSockets.get(userPayload.id)!.add(socket.id);
        socketToUserId.set(socket.id, userPayload.id);

        // Send recent messages to this newly joined socket
        const history = await messagesService.getRecentMessages();
        socket.emit("chat:history", history);

        // Send registered users list
        const allUsers = await messagesService.getAllUsers();
        socket.emit("users:list", allUsers);

        // Notify other connected clients about the user and updated lists
        socket.broadcast.emit("user:joined", userPayload);
        socket.broadcast.emit("users:list", allUsers);

        // Join personalized room for secret updates
        socket.join(`mm:user:${userPayload.id}`);

        // Broadcast updated presence
        broadcastPresence();

        if (callback) {
          callback({ status: "ok", user: userPayload });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to join";
        console.error(`[Socket.IO] user:join error:`, msg);
        if (callback) {
          callback({ status: "error", message: msg });
        }
      }
    });

    // Handle message sending: Saved to PostgreSQL BEFORE broadcast
    socket.on("chat:send", async (payload: SendMessagePayload, callback) => {
      try {
        const text = payload.text?.trim();
        if (!text) {
          if (callback) callback({ status: "error", message: "Cannot send empty message." });
          return;
        }

        // 1. Save to PostgreSQL with Prisma
        const savedMessage = await messagesService.saveMessage({
          text,
          senderId: payload.senderId,
          senderName: payload.senderName,
          senderUsername: payload.senderUsername,
          recipientId: payload.recipientId,
          groupId: payload.groupId,
        });

        console.log(`[Socket.IO] Saved message ${savedMessage.id} (recipient: ${savedMessage.recipientId || "all"}, group: ${savedMessage.groupId || "none"})`);

        // 2. Broadcast to ALL connected clients
        io.emit("chat:message", savedMessage);

        if (callback) {
          callback({ status: "ok", message: savedMessage });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to send message";
        console.error(`[Socket.IO] chat:send error:`, msg);
        socket.emit("error", { message: msg });
        if (callback) {
          callback({ status: "error", message: msg });
        }
      }
    });

    // Handle message editing (within 5 minutes of sending)
    socket.on("message:edit", async (payload, callback) => {
      try {
        const result = await messagesService.editMessage(payload);
        console.log(`[Socket.IO] Message edited: ${result.message.id}`);

        // Broadcast to all clients
        io.emit("message:edited", {
          messageId: result.message.id,
          text: result.message.text,
          isEdited: true,
          editedAt: result.message.editedAt,
          groupId: result.groupId,
          recipientId: result.recipientId,
          senderId: result.message.senderId,
        });

        if (callback) callback({ status: "ok", message: result.message });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to edit message";
        console.error(`[Socket.IO] message:edit error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle message deletion (delete for me OR delete for everyone)
    socket.on("message:delete", async (payload, callback) => {
      try {
        const result = await messagesService.deleteMessage(payload);
        console.log(`[Socket.IO] Message deleted: ${result.messageId} (mode: ${result.deleteFor})`);

        if (result.deleteFor === "everyone") {
          // Broadcast to all clients
          io.emit("message:deleted", {
            messageId: result.messageId,
            deleteFor: "everyone",
            deletedByUserId: result.deletedByUserId,
            deletedByUsername: result.deletedByUsername,
          });
        } else {
          // Delete for me: notify only the deleter's active sockets
          const userSocketIds = activeUserSockets.get(payload.userId);
          if (userSocketIds) {
            userSocketIds.forEach((sId) => {
              io.to(sId).emit("message:deleted", {
                messageId: result.messageId,
                deleteFor: "me",
                deletedByUserId: result.deletedByUserId,
              });
            });
          }
        }

        if (callback) callback({ status: "ok" });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to delete message";
        console.error(`[Socket.IO] message:delete error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle blocking a user
    socket.on("user:block", async (payload, callback) => {
      try {
        await messagesService.blockUser(payload.blockerId, payload.targetUserId);
        console.log(`[Socket.IO] User ${payload.blockerId} blocked ${payload.targetUserId}`);
        const blockerSocketIds = activeUserSockets.get(payload.blockerId);
        if (blockerSocketIds) {
          blockerSocketIds.forEach((sId) => {
            io.to(sId).emit("user:blocked", payload);
          });
        }
        if (callback) callback({ status: "ok" });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to block user";
        console.error(`[Socket.IO] user:block error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle unblocking a user
    socket.on("user:unblock", async (payload, callback) => {
      try {
        await messagesService.unblockUser(payload.blockerId, payload.targetUserId);
        console.log(`[Socket.IO] User ${payload.blockerId} unblocked ${payload.targetUserId}`);
        const blockerSocketIds = activeUserSockets.get(payload.blockerId);
        if (blockerSocketIds) {
          blockerSocketIds.forEach((sId) => {
            io.to(sId).emit("user:unblocked", payload);
          });
        }
        if (callback) callback({ status: "ok" });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to unblock user";
        console.error(`[Socket.IO] user:unblock error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle group creation with invitations

    socket.on("group:create", async (payload, callback) => {
      try {
        const { group, invitations } = await messagesService.createGroup(payload);
        console.log(`[Socket.IO] Created group: ${group.name} (${group.id}), sent ${invitations.length} invites`);
        io.emit("group:created", group);
        invitations.forEach((inv) => io.emit("group:invitation", inv));
        if (callback) callback({ status: "ok", group });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to create group";
        console.error(`[Socket.IO] group:create error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle group invitations
    socket.on("group:invite", async (payload, callback) => {
      try {
        const { group, invitations } = await messagesService.inviteMembersToGroup(payload);
        console.log(`[Socket.IO] Invited members to group: ${group.name} (${group.id}), sent ${invitations.length} invites`);
        io.emit("group:updated", group);
        invitations.forEach((inv) => io.emit("group:invitation", inv));
        if (callback) callback({ status: "ok", group });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to invite members";
        console.error(`[Socket.IO] group:invite error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle response to group invitation (accept or decline)
    socket.on("group:respondInvite", async (payload, callback) => {
      try {
        const group = await messagesService.respondToInvitation(payload);
        console.log(`[Socket.IO] User ${payload.userId} ${payload.response}ed invitation ${payload.invitationId}`);
        io.emit("group:updated", group);
        if (callback) callback({ status: "ok", group });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to respond to invitation";
        console.error(`[Socket.IO] group:respondInvite error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle Chugli duration extension
    socket.on("chugli:extend", async (payload, callback) => {
      try {
        const group = await messagesService.extendChugliGroup(
          payload.groupId,
          payload.userId,
          payload.additionalMinutes
        );
        console.log(`[Socket.IO] Extended Chugli group ${group.name} by ${payload.additionalMinutes}m (new expiry: ${group.expiresAt})`);
        io.emit("group:updated", group);
        io.emit("chugli:extended", {
          group,
          expiresAt: group.expiresAt || "",
          additionalMinutes: payload.additionalMinutes,
        });
        if (callback) callback({ status: "ok", group });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to extend Chugli session";
        console.error(`[Socket.IO] chugli:extend error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle Chugli early session termination by admin
    socket.on("chugli:end", async (payload, callback) => {
      try {
        const res = await messagesService.endChugliGroup(payload.groupId, payload.userId);
        console.log(`[Socket.IO] Admin ended Chugli group ${res.name} (${res.id})`);
        io.emit("chugli:expired", { groupId: res.id, groupName: res.name });
        if (callback) callback({ status: "ok" });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to end Chugli session";
        console.error(`[Socket.IO] chugli:end error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle setting secret alias
    socket.on("chugli:setAlias", async (payload, callback) => {
      try {
        const group = await messagesService.setMemberAlias(payload.groupId, payload.userId, payload.alias);
        console.log(`[Socket.IO] Set alias "${payload.alias}" for user ${payload.userId} in group ${group.id}`);
        io.emit("group:updated", group);
        if (callback) callback({ status: "ok", group });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to set alias";
        console.error(`[Socket.IO] chugli:setAlias error:`, msg);
        if (callback) callback({ status: "error", message: msg });
      }
    });

    // Handle message read receipts
    socket.on("message:read", async (payload: MarkReadPayload) => {
      try {
        if (!payload.messageIds || payload.messageIds.length === 0 || !payload.userId) {
          return;
        }

        const reader = await messagesService.markMessagesAsRead(
          payload.messageIds,
          payload.userId,
          payload.userName
        );

        console.log(
          `[Socket.IO] Marked ${payload.messageIds.length} messages read by ${payload.userName} (${payload.userId})`
        );

        // Broadcast read receipt only to sockets whose user is NOT blocked by this reader
        const blockedUsers = await messagesService.getBlockedUserIds(payload.userId);
        const blockedSet = new Set(blockedUsers);

        for (const [userId, socketIds] of activeUserSockets.entries()) {
          if (!blockedSet.has(userId)) {
            socketIds.forEach((sId) => {
              io.to(sId).emit("messages:read", {
                messageIds: payload.messageIds,
                reader,
              });
            });
          }
        }
      } catch (error) {
        console.error("[Socket.IO] message:read error:", error);
      }
    });

    // --- Murder Mystery Socket Events ---
    socket.on("mm:create", async (payload, callback) => {
      try {
        const room = await murderMysteryService.createRoom(payload);
        socket.join(`mm:${room.id}`);
        console.log(`[MM] Room created: ${room.code} (${room.name}) by ${payload.adminId}`);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[MM] create error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:join", async (payload, callback) => {
      try {
        const room = await murderMysteryService.joinRoom(payload);
        socket.join(`mm:${room.id}`);
        socket.join(`mm:user:${payload.userId}`);
        await murderMysteryService.broadcastRoomState(room.id, io);
        console.log(`[MM] Player ${payload.userId} joined room ${room.code}`);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[MM] join error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:ready", async (payload, callback) => {
      try {
        const room = await murderMysteryService.toggleReady(payload, io);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[MM] ready error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:start", async (payload, callback) => {
      try {
        const room = await murderMysteryService.startGame(payload, io);
        console.log(`[MM] Game started in room ${room.code}!`);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[MM] start error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:viewedRole", async (payload, callback) => {
      try {
        await murderMysteryService.viewedRole(payload, io);
        if (callback) callback({ status: "ok" });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:murdererAction", async (payload, callback) => {
      try {
        await murderMysteryService.submitMurdererAction(payload, io);
        if (callback) callback({ status: "ok" });
      } catch (err: any) {
        console.error("[MM] murdererAction error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:healerAction", async (payload, callback) => {
      try {
        await murderMysteryService.submitHealerAction(payload, io);
        if (callback) callback({ status: "ok" });
      } catch (err: any) {
        console.error("[MM] healerAction error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:vote", async (payload, callback) => {
      try {
        await murderMysteryService.castVote(payload, io);
        if (callback) callback({ status: "ok" });
      } catch (err: any) {
        console.error("[MM] vote error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:message", async (payload, callback) => {
      try {
        const msg = await murderMysteryService.sendMessage(payload, io);
        if (callback) callback({ status: "ok", message: msg });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:playAgain", async (payload, callback) => {
      try {
        const room = await murderMysteryService.playAgain(payload.roomId, payload.userId, io);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("mm:leave", async (payload, callback) => {
      try {
        socket.leave(`mm:${payload.roomId}`);
        if (callback) callback({ status: "ok" });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    // ==========================================
    // CHESS SOCKET HANDLERS
    // ==========================================
    socket.on("chess:create", (payload, callback) => {
      try {
        const room = chessService.createRoom(payload);
        socket.join(`chess:${room.roomId}`);
        console.log(`[Chess] Room created: ${room.code} (${room.roomId})`);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[Chess] create error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("chess:join", (payload, callback) => {
      try {
        const room = chessService.joinRoom(payload);
        socket.join(`chess:${room.roomId}`);
        io.to(`chess:${room.roomId}`).emit("chess:state", room);
        console.log(`[Chess] User ${payload.userId} joined room ${room.code}`);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[Chess] join error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("chess:move", (payload, callback) => {
      try {
        const room = chessService.makeMove(payload, io);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[Chess] move error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("chess:reset", (payload, callback) => {
      try {
        const room = chessService.resetRoom(payload.roomId, io);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("chess:leave", (payload, callback) => {
      try {
        socket.leave(`chess:${payload.roomId}`);
        const room = chessService.leaveRoom(payload.roomId, payload.userId, io);
        if (callback) callback({ status: "ok", room: room || undefined });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    // ==========================================
    // LUDO SOCKET HANDLERS (UP TO 6 PLAYERS)
    // ==========================================
    socket.on("ludo:create", (payload, callback) => {
      try {
        const room = ludoService.createRoom(payload);
        socket.join(`ludo:${room.roomId}`);
        console.log(`[Ludo] Room created: ${room.code} (max: ${room.maxPlayers})`);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[Ludo] create error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("ludo:join", (payload, callback) => {
      try {
        const room = ludoService.joinRoom(payload);
        socket.join(`ludo:${room.roomId}`);
        io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
        console.log(`[Ludo] User ${payload.userId} joined room ${room.code}`);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[Ludo] join error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("ludo:addBot", (payload, callback) => {
      try {
        const room = ludoService.addBot(payload);
        io.to(`ludo:${room.roomId}`).emit("ludo:state", room);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("ludo:start", (payload, callback) => {
      try {
        const room = ludoService.startGame(payload.roomId, io);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("ludo:roll", (payload, callback) => {
      try {
        const result = ludoService.rollDice(payload, io);
        if (callback) callback({ status: "ok", value: result.value, canMove: result.canMove, room: result.room });
      } catch (err: any) {
        console.error("[Ludo] roll error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("ludo:moveToken", (payload, callback) => {
      try {
        const room = ludoService.moveToken(payload, io);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        console.error("[Ludo] moveToken error:", err.message);
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("ludo:reset", (payload, callback) => {
      try {
        const room = ludoService.resetRoom(payload.roomId, io);
        if (callback) callback({ status: "ok", room });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("ludo:leave", (payload, callback) => {
      try {
        socket.leave(`ludo:${payload.roomId}`);
        const room = ludoService.leaveRoom(payload.roomId, payload.userId, io);
        if (callback) callback({ status: "ok", room: room || undefined });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    // ==========================================
    // IN-GAME LIVE CHAT & VOICE COMMUNICATION
    // ==========================================
    socket.on("game:chat:send", (payload, callback) => {
      try {
        const message: GameChatMessage = {
          id: `gmsg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          gameType: payload.gameType,
          roomId: payload.roomId,
          senderId: payload.senderId,
          senderName: payload.senderName,
          senderColor: payload.senderColor,
          text: payload.text.trim(),
          timestamp: Date.now(),
        };

        io.to(`${payload.gameType}:${payload.roomId}`).emit("game:chat:message", message);
        if (callback) callback({ status: "ok", message });
      } catch (err: any) {
        if (callback) callback({ status: "error", message: err.message });
      }
    });

    socket.on("game:voice:chunk", (payload) => {
      try {
        const roomName = `${payload.gameType}:${payload.roomId}`;
        const roomSockets = io.sockets.adapter.rooms.get(roomName);
        const recipientCount = roomSockets ? roomSockets.size - 1 : 0;
        console.log(`[Voice] Relayed chunk: ${payload.audioChunk?.length || 0} chars from ${payload.senderName || payload.senderId} to room ${roomName} (${recipientCount} recipients)`);
        socket.to(roomName).emit("game:voice:chunk", payload);
      } catch (err: any) {
        console.error("[Voice] Chunk relay error:", err.message);
      }
    });

    socket.on("game:voice:status", (payload) => {
      try {
        const roomName = `${payload.gameType}:${payload.roomId}`;
        console.log(`[Voice] User ${payload.userId} speaking=${payload.isSpeaking} muted=${payload.isMuted} in ${roomName}`);
        socket.to(roomName).emit("game:voice:status", payload);
      } catch (err: any) {
        console.error("[Voice] Status relay error:", err.message);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);

      // Cleanup user presence
      const userId = socketToUserId.get(socket.id);
      if (userId) {
        socketToUserId.delete(socket.id);
        const userSet = activeUserSockets.get(userId);
        if (userSet) {
          userSet.delete(socket.id);
          if (userSet.size === 0) {
            activeUserSockets.delete(userId);
          }
        }
        broadcastPresence();
      }
    });
  });
}
