import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ChatMessage,
  SendMessagePayload,
  ChatUser,
  ReadReceipt,
  MarkReadPayload,
  GroupChat,
  CreateGroupPayload,
  InviteGroupMembersPayload,
  GroupInvitationInfo,
  RespondInvitationPayload,
  ExtendChugliPayload,
  SetChugliAliasPayload,
  MMRoomState,
  MMMessage,
  MMRole,
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
  ChessGameState,
  ChessMove,
  CreateChessRoomPayload,
  JoinChessRoomPayload,
  MoveChessPayload,
  LudoGameState,
  CreateLudoRoomPayload,
  JoinLudoRoomPayload,
  AddLudoBotPayload,
  RollLudoDicePayload,
  MoveLudoTokenPayload,
  LudoColor,
  GameChatMessage,
  GameVoiceChunk,
  GameVoiceStatus,
} from "@chatapp/shared";
import { getServerUrl } from "./api";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

type MessageListener = (message: ChatMessage) => void;
type StatusListener = (status: ConnectionStatus) => void;
type ErrorListener = (error: string) => void;
type UsersListener = (users: ChatUser[]) => void;
type PresenceListener = (onlineUserIds: string[]) => void;
type ReadReceiptListener = (data: { messageIds: string[]; reader: ReadReceipt }) => void;
type GroupListener = (group: GroupChat) => void;
type InvitationListener = (invitation: GroupInvitationInfo) => void;
type ChugliWarningListener = (data: { groupId: string; groupName: string; expiresAt: string; remainingMinutes: number }) => void;
type ChugliExtendedListener = (data: { group: GroupChat; expiresAt: string; additionalMinutes: number }) => void;
type ChugliExpiredListener = (data: { groupId: string; groupName: string }) => void;
type MessageDeletedListener = (data: {
  messageId: string;
  deleteFor: "me" | "everyone";
  deletedByUserId?: string;
  deletedByUsername?: string;
}) => void;
type MessageEditedListener = (data: {
  messageId: string;
  text: string;
  isEdited: boolean;
  editedAt?: string;
  groupId?: string;
  recipientId?: string;
  senderId: string;
}) => void;
type UserBlockedListener = (data: { blockerId: string; targetUserId: string }) => void;
type UserUnblockedListener = (data: { blockerId: string; targetUserId: string }) => void;
type MMStateListener = (room: MMRoomState) => void;
type MMMessageListener = (message: MMMessage) => void;
type MMNightResultListener = (data: { eliminatedNames: string[]; everyoneSurvived: boolean }) => void;
type MMVotingResultListener = (data: { eliminatedPlayer?: { id: string; name: string; role: MMRole }; isTie: boolean; isRunoff: boolean }) => void;
type MMGameOverListener = (data: { winnerTeam: "INNOCENTS" | "MURDERERS"; roles: Record<string, MMRole>; history: MMHistoryItem[] }) => void;

type ChessStateListener = (room: ChessGameState) => void;
type ChessMoveListener = (data: { move: ChessMove; room: ChessGameState }) => void;

type LudoStateListener = (room: LudoGameState) => void;
type LudoDiceListener = (data: { color: LudoColor; value: number; canMove: boolean }) => void;
type LudoTokenListener = (data: { color: LudoColor; tokenId: number; step: number; isHome: boolean }) => void;

type GameChatListener = (message: GameChatMessage) => void;
type GameVoiceChunkListener = (chunk: GameVoiceChunk) => void;
type GameVoiceStatusListener = (status: GameVoiceStatus) => void;

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private status: ConnectionStatus = "disconnected";
  private messageListeners = new Set<MessageListener>();
  private messageDeletedListeners = new Set<MessageDeletedListener>();
  private messageEditedListeners = new Set<MessageEditedListener>();
  private userBlockedListeners = new Set<UserBlockedListener>();
  private userUnblockedListeners = new Set<UserUnblockedListener>();
  private statusListeners = new Set<StatusListener>();
  private errorListeners = new Set<ErrorListener>();
  private usersListeners = new Set<UsersListener>();
  private presenceListeners = new Set<PresenceListener>();
  private readReceiptListeners = new Set<ReadReceiptListener>();
  private groupListeners = new Set<GroupListener>();
  private invitationListeners = new Set<InvitationListener>();
  private chugliWarningListeners = new Set<ChugliWarningListener>();
  private chugliExtendedListeners = new Set<ChugliExtendedListener>();
  private chugliExpiredListeners = new Set<ChugliExpiredListener>();
  private mmStateListeners = new Set<MMStateListener>();
  private mmMessageListeners = new Set<MMMessageListener>();
  private mmNightResultListeners = new Set<MMNightResultListener>();
  private mmVotingResultListeners = new Set<MMVotingResultListener>();
  private mmGameOverListeners = new Set<MMGameOverListener>();

  private chessStateListeners = new Set<ChessStateListener>();
  private chessMoveListeners = new Set<ChessMoveListener>();

  private ludoStateListeners = new Set<LudoStateListener>();
  private ludoDiceListeners = new Set<LudoDiceListener>();
  private ludoTokenListeners = new Set<LudoTokenListener>();

  private gameChatListeners = new Set<GameChatListener>();
  private gameVoiceChunkListeners = new Set<GameVoiceChunkListener>();
  private gameVoiceStatusListeners = new Set<GameVoiceStatusListener>();

  private onlineUserIds: string[] = [];
  private currentUser: ChatUser | null = null;

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getOnlineUserIds(): string[] {
    return this.onlineUserIds;
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status !== status) {
      this.status = status;
      this.statusListeners.forEach((listener) => listener(status));
    }
  }

  connect(user?: ChatUser): void {
    if (user) {
      this.currentUser = user;
    }

    if (this.socket) {
      if (this.socket.connected) {
        if (this.currentUser) {
          this.joinChat(this.currentUser);
        }
        return;
      }
      this.socket.disconnect();
      this.socket = null;
    }

    this.setStatus("connecting");

    const serverUrl = getServerUrl();
    console.log(`Connecting Socket.IO to ${serverUrl}...`);

    this.socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on("connect", () => {
      console.log(`Socket.IO connected with id: ${this.socket?.id}`);
      this.setStatus("connected");
      if (this.currentUser) {
        this.joinChat(this.currentUser);
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`Socket.IO disconnected: ${reason}`);
      this.setStatus("disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.warn("Socket.IO connect_error:", error.message);
      this.setStatus("error");
      this.errorListeners.forEach((l) => l(`Connection error: ${error.message}`));
    });

    this.socket.on("chat:message", (message: ChatMessage) => {
      this.messageListeners.forEach((listener) => listener(message));
    });

    this.socket.on("users:list", (users: ChatUser[]) => {
      this.usersListeners.forEach((listener) => listener(users));
    });

    this.socket.on("users:presence", (onlineIds: string[]) => {
      this.onlineUserIds = onlineIds;
      this.presenceListeners.forEach((listener) => listener(onlineIds));
    });

    this.socket.on("messages:read", (data) => {
      this.readReceiptListeners.forEach((listener) => listener(data));
    });

    this.socket.on("group:created", (group) => {
      this.groupListeners.forEach((l) => l(group));
    });

    this.socket.on("group:updated", (group) => {
      this.groupListeners.forEach((l) => l(group));
    });

    this.socket.on("group:invitation", (invitation) => {
      this.invitationListeners.forEach((l) => l(invitation));
    });

    this.socket.on("chugli:warning", (data) => {
      this.chugliWarningListeners.forEach((l) => l(data));
    });

    this.socket.on("chugli:extended", (data) => {
      this.chugliExtendedListeners.forEach((l) => l(data));
    });

    this.socket.on("chugli:expired", (data) => {
      this.chugliExpiredListeners.forEach((l) => l(data));
    });

    this.socket.on("mm:state", (room) => {
      this.mmStateListeners.forEach((l) => l(room));
    });

    this.socket.on("mm:message", (message) => {
      this.mmMessageListeners.forEach((l) => l(message));
    });

    this.socket.on("mm:nightResult", (data) => {
      this.mmNightResultListeners.forEach((l) => l(data));
    });

    this.socket.on("mm:votingResult", (data) => {
      this.mmVotingResultListeners.forEach((l) => l(data));
    });

    this.socket.on("mm:gameOver", (data) => {
      this.mmGameOverListeners.forEach((l) => l(data));
    });

    this.socket.on("chess:state", (room) => {
      this.chessStateListeners.forEach((l) => l(room));
    });

    this.socket.on("chess:moveMade", (data) => {
      this.chessMoveListeners.forEach((l) => l(data));
    });

    this.socket.on("ludo:state", (room) => {
      this.ludoStateListeners.forEach((l) => l(room));
    });

    this.socket.on("ludo:diceRolled", (data) => {
      this.ludoDiceListeners.forEach((l) => l(data));
    });

    this.socket.on("ludo:tokenMoved", (data) => {
      this.ludoTokenListeners.forEach((l) => l(data));
    });

    this.socket.on("game:chat:message", (message) => {
      this.gameChatListeners.forEach((l) => l(message));
    });

    this.socket.on("game:voice:chunk", (chunk) => {
      this.gameVoiceChunkListeners.forEach((l) => l(chunk));
    });

    this.socket.on("game:voice:status", (status) => {
      this.gameVoiceStatusListeners.forEach((l) => l(status));
    });

    this.socket.on("message:deleted", (data) => {
      this.messageDeletedListeners.forEach((l) => l(data));
    });

    this.socket.on("message:edited", (data) => {
      this.messageEditedListeners.forEach((l) => l(data));
    });

    this.socket.on("user:blocked", (data) => {
      this.userBlockedListeners.forEach((l) => l(data));
    });

    this.socket.on("user:unblocked", (data) => {
      this.userUnblockedListeners.forEach((l) => l(data));
    });

    this.socket.on("error", (errorData) => {

      console.warn("Socket.IO server error event:", errorData.message);
      this.errorListeners.forEach((listener) => listener(errorData.message));
    });
  }

  joinChat(user: ChatUser): void {
    if (!this.socket || !this.socket.connected) return;
    this.currentUser = user;
    this.socket.emit("user:join", user, (response) => {
      if (response.status === "ok") {
        console.log(`User joined successfully as ${user.name} (@${user.username})`);
      } else {
        console.warn("Failed to join chat:", response.message);
      }
    });
  }

  sendMessage(
    text: string,
    options?: { recipientId?: string; groupId?: string }
  ): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return reject(new Error("Cannot send empty message."));
      }
      if (!this.currentUser) {
        return reject(new Error("You must join with a profile first."));
      }
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Not connected to chat server."));
      }

      const payload: SendMessagePayload = {
        text: trimmed,
        senderId: this.currentUser.id,
        senderName: this.currentUser.name,
        senderUsername: this.currentUser.username,
        recipientId: options?.recipientId,
        groupId: options?.groupId,
      };

      this.socket.emit("chat:send", payload, (response) => {
        if (response && response.status === "ok" && response.message) {
          resolve(response.message);
        } else {
          const errMsg =
            response && response.status === "error"
              ? response.message
              : "Failed to deliver message";
          reject(new Error(errMsg));
        }
      });
    });
  }

  createGroup(payload: CreateGroupPayload): Promise<GroupChat> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Not connected to chat server."));
      }
      this.socket.emit("group:create", payload, (res) => {
        if (res.status === "ok" && res.group) {
          resolve(res.group);
        } else {
          const errMsg = res.status === "error" ? res.message : "Failed to create group";
          reject(new Error(errMsg));
        }
      });
    });
  }

  inviteGroupMembers(payload: InviteGroupMembersPayload): Promise<GroupChat> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Not connected to chat server."));
      }
      this.socket.emit("group:invite", payload, (res) => {
        if (res.status === "ok" && res.group) {
          resolve(res.group);
        } else {
          const errMsg = res.status === "error" ? res.message : "Failed to invite members";
          reject(new Error(errMsg));
        }
      });
    });
  }

  respondToGroupInvitation(payload: RespondInvitationPayload): Promise<GroupChat> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Not connected to chat server."));
      }
      this.socket.emit("group:respondInvite", payload, (res) => {
        if (res.status === "ok" && res.group) {
          resolve(res.group);
        } else {
          const errMsg = res.status === "error" ? res.message : "Failed to respond to invitation";
          reject(new Error(errMsg));
        }
      });
    });
  }

  markMessagesAsRead(messageIds: string[]): void {
    if (!messageIds || messageIds.length === 0 || !this.currentUser || !this.socket) {
      return;
    }

    const payload: MarkReadPayload = {
      messageIds,
      userId: this.currentUser.id,
      userName: this.currentUser.name,
    };

    this.socket.emit("message:read", payload);
  }

  subscribeToMessages(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  subscribeToUsers(listener: UsersListener): () => void {
    this.usersListeners.add(listener);
    return () => {
      this.usersListeners.delete(listener);
    };
  }

  subscribeToPresence(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener);
    listener(this.onlineUserIds);
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  subscribeToReadReceipts(listener: ReadReceiptListener): () => void {
    this.readReceiptListeners.add(listener);
    return () => {
      this.readReceiptListeners.delete(listener);
    };
  }

  subscribeToGroups(listener: GroupListener): () => void {
    this.groupListeners.add(listener);
    return () => {
      this.groupListeners.delete(listener);
    };
  }

  subscribeToInvitations(listener: InvitationListener): () => void {
    this.invitationListeners.add(listener);
    return () => {
      this.invitationListeners.delete(listener);
    };
  }

  subscribeToMessageDeleted(listener: MessageDeletedListener): () => void {
    this.messageDeletedListeners.add(listener);
    return () => {
      this.messageDeletedListeners.delete(listener);
    };
  }

  subscribeToMessageEdited(listener: MessageEditedListener): () => void {
    this.messageEditedListeners.add(listener);
    return () => {
      this.messageEditedListeners.delete(listener);
    };
  }

  editMessage(messageId: string, newText: string): Promise<ChatMessage | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.currentUser) {
        return reject(new Error("Socket not connected or no active user."));
      }
      this.socket.emit("message:edit", { messageId, userId: this.currentUser.id, newText }, (res) => {
        if (res.status === "ok") {
          resolve(res.message);
        } else {
          reject(new Error(res.message || "Failed to edit message"));
        }
      });
    });
  }

  subscribeToUserBlocked(listener: UserBlockedListener): () => void {
    this.userBlockedListeners.add(listener);
    return () => {
      this.userBlockedListeners.delete(listener);
    };
  }

  subscribeToUserUnblocked(listener: UserUnblockedListener): () => void {
    this.userUnblockedListeners.add(listener);
    return () => {
      this.userUnblockedListeners.delete(listener);
    };
  }

  deleteMessage(messageId: string, deleteFor: "me" | "everyone"): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.currentUser) {
        return reject(new Error("Socket not connected or no active user."));
      }
      this.socket.emit("message:delete", { messageId, userId: this.currentUser.id, deleteFor }, (res) => {
        if (res.status === "ok") {
          resolve();
        } else {
          reject(new Error(res.message || "Failed to delete message"));
        }
      });
    });
  }

  blockUser(targetUserId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.currentUser) {
        return reject(new Error("Socket not connected or no active user."));
      }
      this.socket.emit("user:block", { blockerId: this.currentUser.id, targetUserId }, (res) => {
        if (res.status === "ok") {
          resolve();
        } else {
          reject(new Error(res.message || "Failed to block user"));
        }
      });
    });
  }

  unblockUser(targetUserId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.currentUser) {
        return reject(new Error("Socket not connected or no active user."));
      }
      this.socket.emit("user:unblock", { blockerId: this.currentUser.id, targetUserId }, (res) => {
        if (res.status === "ok") {
          resolve();
        } else {
          reject(new Error(res.message || "Failed to unblock user"));
        }
      });
    });
  }


  extendChugli(payload: ExtendChugliPayload): Promise<GroupChat> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Not connected to chat server."));
      }
      this.socket.emit("chugli:extend", payload, (res) => {
        if (res.status === "ok" && res.group) {
          resolve(res.group);
        } else {
          const errMsg = res.status === "error" ? res.message : "Failed to extend Chugli session";
          reject(new Error(errMsg));
        }
      });
    });
  }

  endChugli(groupId: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Not connected to chat server."));
      }
      this.socket.emit("chugli:end", { groupId, userId }, (res) => {
        if (res.status === "ok") {
          resolve();
        } else {
          const errMsg = res.status === "error" ? res.message : "Failed to end Chugli session";
          reject(new Error(errMsg));
        }
      });
    });
  }

  setChugliAlias(payload: SetChugliAliasPayload): Promise<GroupChat> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Not connected to chat server."));
      }
      this.socket.emit("chugli:setAlias", payload, (res) => {
        if (res.status === "ok" && res.group) {
          resolve(res.group);
        } else {
          const errMsg = res.status === "error" ? res.message : "Failed to set alias";
          reject(new Error(errMsg));
        }
      });
    });
  }

  subscribeToChugliWarning(listener: ChugliWarningListener): () => void {
    this.chugliWarningListeners.add(listener);
    return () => {
      this.chugliWarningListeners.delete(listener);
    };
  }

  subscribeToChugliExtended(listener: ChugliExtendedListener): () => void {
    this.chugliExtendedListeners.add(listener);
    return () => {
      this.chugliExtendedListeners.delete(listener);
    };
  }

  subscribeToChugliExpired(listener: ChugliExpiredListener): () => void {
    this.chugliExpiredListeners.add(listener);
    return () => {
      this.chugliExpiredListeners.delete(listener);
    };
  }

  // Murder Mystery Subscriptions
  subscribeToMMState(listener: MMStateListener): () => void {
    this.mmStateListeners.add(listener);
    return () => {
      this.mmStateListeners.delete(listener);
    };
  }

  subscribeToMMMessage(listener: MMMessageListener): () => void {
    this.mmMessageListeners.add(listener);
    return () => {
      this.mmMessageListeners.delete(listener);
    };
  }

  subscribeToMMNightResult(listener: MMNightResultListener): () => void {
    this.mmNightResultListeners.add(listener);
    return () => {
      this.mmNightResultListeners.delete(listener);
    };
  }

  subscribeToMMVotingResult(listener: MMVotingResultListener): () => void {
    this.mmVotingResultListeners.add(listener);
    return () => {
      this.mmVotingResultListeners.delete(listener);
    };
  }

  subscribeToMMGameOver(listener: MMGameOverListener): () => void {
    this.mmGameOverListeners.add(listener);
    return () => {
      this.mmGameOverListeners.delete(listener);
    };
  }

  // Murder Mystery Socket Actions
  createMMRoom(payload: CreateMMRoomPayload): Promise<MMRoomState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:create", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to create room"));
      });
    });
  }

  joinMMRoom(payload: JoinMMRoomPayload): Promise<MMRoomState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:join", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to join room"));
      });
    });
  }

  toggleMMReady(payload: ToggleMMReadyPayload): Promise<MMRoomState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:ready", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to update ready"));
      });
    });
  }

  startMMGame(payload: StartMMGamePayload): Promise<MMRoomState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:start", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to start game"));
      });
    });
  }

  viewedMMRole(payload: ViewedMMRolePayload): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return resolve();
      this.socket.emit("mm:viewedRole", payload, (res) => {
        if (res.status === "ok") resolve();
        else reject(new Error(res.status === "error" ? res.message : "Failed to confirm role"));
      });
    });
  }

  submitMMMurdererAction(payload: MMMurdererActionPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:murdererAction", payload, (res) => {
        if (res.status === "ok") resolve();
        else reject(new Error(res.status === "error" ? res.message : "Failed to submit murder"));
      });
    });
  }

  submitMMHealerAction(payload: MMHealerActionPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:healerAction", payload, (res) => {
        if (res.status === "ok") resolve();
        else reject(new Error(res.status === "error" ? res.message : "Failed to submit heal"));
      });
    });
  }

  castMMVote(payload: MMCastVotePayload): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:vote", payload, (res) => {
        if (res.status === "ok") resolve();
        else reject(new Error(res.status === "error" ? res.message : "Failed to cast vote"));
      });
    });
  }

  sendMMMessage(payload: MMSendMessagePayload): Promise<MMMessage> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:message", payload, (res) => {
        if (res.status === "ok" && res.message) resolve(res.message);
        else reject(new Error(res.status === "error" ? res.message : "Failed to send message"));
      });
    });
  }

  playAgainMMRoom(roomId: string, userId: string): Promise<MMRoomState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("mm:playAgain", { roomId, userId }, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to reset room"));
      });
    });
  }

  leaveMMRoom(roomId: string, userId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("mm:leave", { roomId, userId });
    }
  }

  // ==========================================
  // CHESS METHODS
  // ==========================================
  createChessRoom(payload: CreateChessRoomPayload): Promise<ChessGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("chess:create", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to create chess room"));
      });
    });
  }

  joinChessRoom(payload: JoinChessRoomPayload): Promise<ChessGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("chess:join", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to join chess room"));
      });
    });
  }

  moveChess(payload: MoveChessPayload): Promise<ChessGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("chess:move", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to make move"));
      });
    });
  }

  resetChess(roomId: string, userId: string): Promise<ChessGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("chess:reset", { roomId, userId }, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to reset chess game"));
      });
    });
  }

  leaveChess(roomId: string, userId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("chess:leave", { roomId, userId });
    }
  }

  subscribeToChessState(listener: ChessStateListener): () => void {
    this.chessStateListeners.add(listener);
    return () => {
      this.chessStateListeners.delete(listener);
    };
  }

  subscribeToChessMove(listener: ChessMoveListener): () => void {
    this.chessMoveListeners.add(listener);
    return () => {
      this.chessMoveListeners.delete(listener);
    };
  }

  // ==========================================
  // LUDO METHODS
  // ==========================================
  createLudoRoom(payload: CreateLudoRoomPayload): Promise<LudoGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("ludo:create", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to create ludo room"));
      });
    });
  }

  joinLudoRoom(payload: JoinLudoRoomPayload): Promise<LudoGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("ludo:join", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to join ludo room"));
      });
    });
  }

  addLudoBot(payload: AddLudoBotPayload): Promise<LudoGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("ludo:addBot", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to add bot"));
      });
    });
  }

  startLudoGame(roomId: string, userId: string): Promise<LudoGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("ludo:start", { roomId, userId }, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to start ludo"));
      });
    });
  }

  rollLudoDice(roomId: string, userId: string): Promise<{ value: number; canMove: boolean; room?: LudoGameState }> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("ludo:roll", { roomId, userId }, (res) => {
        if (res.status === "ok") resolve(res);
        else reject(new Error(res.status === "error" ? res.message : "Failed to roll dice"));
      });
    });
  }

  moveLudoToken(payload: MoveLudoTokenPayload): Promise<LudoGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("ludo:moveToken", payload, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to move token"));
      });
    });
  }

  resetLudo(roomId: string, userId: string): Promise<LudoGameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("ludo:reset", { roomId, userId }, (res) => {
        if (res.status === "ok" && res.room) resolve(res.room);
        else reject(new Error(res.status === "error" ? res.message : "Failed to reset ludo"));
      });
    });
  }

  leaveLudo(roomId: string, userId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("ludo:leave", { roomId, userId });
    }
  }

  subscribeToLudoState(listener: LudoStateListener): () => void {
    this.ludoStateListeners.add(listener);
    return () => {
      this.ludoStateListeners.delete(listener);
    };
  }

  subscribeToLudoDice(listener: LudoDiceListener): () => void {
    this.ludoDiceListeners.add(listener);
    return () => {
      this.ludoDiceListeners.delete(listener);
    };
  }

  subscribeToLudoToken(listener: LudoTokenListener): () => void {
    this.ludoTokenListeners.add(listener);
    return () => {
      this.ludoTokenListeners.delete(listener);
    };
  }

  // ==========================================
  // IN-GAME LIVE CHAT & VOICE METHODS
  // ==========================================
  sendGameChat(payload: {
    gameType: "chess" | "ludo" | "mm";
    roomId: string;
    senderId: string;
    senderName: string;
    senderColor?: string;
    text: string;
  }): Promise<GameChatMessage> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) return reject(new Error("Socket not connected"));
      this.socket.emit("game:chat:send", payload, (res) => {
        if (res.status === "ok" && res.message) resolve(res.message);
        else reject(new Error(res.status === "error" ? res.message : "Failed to send in-game chat"));
      });
    });
  }

  sendGameVoiceChunk(payload: GameVoiceChunk): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("game:voice:chunk", payload);
    }
  }

  sendGameVoiceStatus(payload: GameVoiceStatus): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("game:voice:status", payload);
    }
  }

  subscribeToGameChat(listener: GameChatListener): () => void {
    this.gameChatListeners.add(listener);
    return () => {
      this.gameChatListeners.delete(listener);
    };
  }

  subscribeToGameVoiceChunk(listener: GameVoiceChunkListener): () => void {
    this.gameVoiceChunkListeners.add(listener);
    return () => {
      this.gameVoiceChunkListeners.delete(listener);
    };
  }

  subscribeToGameVoiceStatus(listener: GameVoiceStatusListener): () => void {
    this.gameVoiceStatusListeners.add(listener);
    return () => {
      this.gameVoiceStatusListeners.delete(listener);
    };
  }

  subscribeToStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeToErrors(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.onlineUserIds = [];
    this.setStatus("disconnected");
  }
}

export const socketService = new SocketService();
