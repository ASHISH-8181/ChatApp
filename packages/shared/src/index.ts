export interface ChatUser {
  id: string;
  name: string;
  username: string;
  phoneNumber: string;
  email?: string | null;
  clerkId?: string | null;
  createdAt?: string;
  avatarUrl?: string | null;
}

export interface RegisterUserPayload {
  name: string;
  username: string;
  phoneNumber: string;
  email?: string | null;
  password?: string;
  clerkId?: string | null;
  avatarUrl?: string | null;
}

export interface LoginUserPayload {
  identifier: string; // username, phone number, or email
  password?: string;
}

export interface ClerkAuthCheckResponse {
  exists: boolean;
  user?: ChatUser;
  message?: string;
}

export interface CheckAvailabilityResponse {
  usernameAvailable: boolean;
  phoneAvailable: boolean;
  phoneValid?: boolean;
  phoneMessage?: string;
  phoneCarrier?: string;
}

export interface UpdateUserPayload {
  name?: string;
  avatarUrl?: string | null;
}

export interface ReadReceipt {
  userId: string;
  userName: string;
  username?: string;
  phoneNumber?: string;
  readAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  recipientId?: string; // For 1-on-1 personal chats
  groupId?: string;     // For group chats
  text: string;
  createdAt: string;
  reads: ReadReceipt[];
  isDeletedForEveryone?: boolean;
  deletedByUserId?: string;
  deletedByUsername?: string;
  deletedForUserIds?: string[];
  isEdited?: boolean;
  editedAt?: string;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  isViewOnce?: boolean;
  isViewed?: boolean;
  viewedAt?: string | null;
  viewedByUserId?: string | null;
  isUploading?: boolean;
  clientTempId?: string;
}

export interface EditMessagePayload {
  messageId: string;
  userId: string;
  newText: string;
}

export interface DeleteMessagePayload {
  messageId: string;
  userId: string;
  deleteFor: "me" | "everyone";
}

export interface BlockUserPayload {
  blockerId: string;
  targetUserId: string;
}

export interface BlockedUserInfo {
  id: string;
  blockedUserId: string;
  name: string;
  username: string;
  phoneNumber?: string;
  createdAt: string;
}

export interface FriendRequestInfo {
  id: string;
  senderId: string;
  receiverId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
  sender?: ChatUser;
  receiver?: ChatUser;
}

export type FriendshipStatus = "friends" | "pending_sent" | "pending_received" | "none";

export interface FriendStatusResponse {
  status: FriendshipStatus;
  requestId?: string;
  isFriend: boolean;
}

export interface SendFriendRequestPayload {
  senderId: string;
  targetUsername: string;
}

export interface RespondFriendRequestPayload {
  requestId: string;
  userId: string;
  action: "accept" | "declined";
}

export interface SendMessagePayload {
  text: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  recipientId?: string;
  groupId?: string;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  isViewOnce?: boolean;
  clientTempId?: string;
}

export interface MarkReadPayload {
  messageIds: string[];
  userId: string;
  userName: string;
}

export interface GroupMemberInfo {
  id: string;
  userId: string;
  name: string;
  username: string;
  role: "admin" | "member";
  anonymousAlias?: string;
  joinedAt: string;
}

export interface GroupInvitationInfo {
  id: string;
  groupId: string;
  groupName: string;
  groupDescription?: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  isChugli?: boolean;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
}

export interface GroupChat {
  id: string;
  name: string;
  description?: string;
  createdById: string;
  isChugli?: boolean;
  durationMinutes?: number;
  expiresAt?: string;
  createdAt: string;
  members: GroupMemberInfo[];
  pendingInvitations?: {
    id: string;
    userId: string;
    name: string;
    username: string;
  }[];
  lastMessage?: string;
  lastMessageAt?: string;
}

export interface CreateGroupPayload {
  name: string;
  description?: string;
  createdById: string;
  inviteUserIds?: string[]; // IDs of users to send invitations to
  isChugli?: boolean;
  durationMinutes?: number;
  creatorAlias?: string;
}

export interface InviteGroupMembersPayload {
  groupId: string;
  senderId: string;
  memberUserIds: string[];
}

export interface RespondInvitationPayload {
  invitationId: string;
  userId: string;
  response: "accept" | "decline";
  anonymousAlias?: string;
}

export interface ExtendChugliPayload {
  groupId: string;
  userId: string;
  additionalMinutes: number;
}

export interface SetChugliAliasPayload {
  groupId: string;
  userId: string;
  alias: string;
}

export interface DeleteGroupPayload {
  groupId: string;
  userId: string;
}

export interface LeaveGroupPayload {
  groupId: string;
  userId: string;
}

export interface HealthResponse {
  status: "ok";
  service: "chatapp-backend";
  timestamp: string;
}

export interface MessagesResponse {
  messages: ChatMessage[];
}

export interface UsersResponse {
  users: ChatUser[];
}

export interface GroupsResponse {
  groups: GroupChat[];
  invitations?: GroupInvitationInfo[];
}

// --- Murder Mystery Types ---
export type MMRole = "MURDERER" | "HEALER" | "NORMAL";

export type MMPhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT_PHASE"
  | "HEALER_PHASE"
  | "NIGHT_RESULT"
  | "DISCUSSION"
  | "VOTING"
  | "RUNOFF_VOTING"
  | "VOTING_RESULT"
  | "GAME_OVER";

export interface MMPlayerInfo {
  id: string;
  userId: string;
  name: string;
  username: string;
  isReady: boolean;
  role?: MMRole;
  isAlive: boolean;
  eliminatedAt?: string;
  eliminatedReason?: "NIGHT" | "VOTE";
  eliminatedRound?: number;
  hasViewedRole: boolean;
  hasVoted?: boolean;
}

export interface MMMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface MMHistoryItem {
  id: string;
  round: number;
  phase: string;
  description: string;
  createdAt: string;
}

export interface MMRoomState {
  id: string;
  code: string;
  name: string;
  adminId: string;
  numMurderers: number;
  numHealers: number;
  votingDuration: number;
  status: MMPhase;
  phaseRound: number;
  phaseExpiresAt?: string;
  phaseTimeRemaining?: number;
  players: MMPlayerInfo[];
  myRole?: MMRole;
  myPlayerId?: string;
  eliminatedTonight: string[];
  eliminatedInVoting?: {
    id: string;
    name: string;
    role: MMRole;
  };
  winnerTeam?: "INNOCENTS" | "MURDERERS";
  initialPlayerCount: number;
  messages: MMMessage[];
  history: MMHistoryItem[];
  runoffCandidates?: string[];
  voteCounts?: Record<string, number>;
}

export interface CreateMMRoomPayload {
  adminId: string;
  name?: string;
  numMurderers: number;
  numHealers: number;
  votingDuration: number;
}

export interface JoinMMRoomPayload {
  code: string;
  userId: string;
}

export interface ToggleMMReadyPayload {
  roomId: string;
  userId: string;
  isReady: boolean;
}

export interface StartMMGamePayload {
  roomId: string;
  userId: string;
}

export interface ViewedMMRolePayload {
  roomId: string;
  userId: string;
}

export interface MMMurdererActionPayload {
  roomId: string;
  userId: string;
  targetUserId: string;
}

export interface MMHealerActionPayload {
  roomId: string;
  userId: string;
  targetUserId: string;
}

export interface MMCastVotePayload {
  roomId: string;
  userId: string;
  targetUserId: string;
}

export interface MMSendMessagePayload {
  roomId: string;
  userId: string;
  text: string;
}

export interface ServerToClientEvents {
  "chat:message": (message: ChatMessage) => void;
  "chat:history": (messages: ChatMessage[]) => void;
  "user:joined": (user: ChatUser) => void;
  "users:list": (users: ChatUser[]) => void;
  "users:presence": (onlineUserIds: string[]) => void;
  "messages:read": (data: { messageIds: string[]; reader: ReadReceipt }) => void;
  "group:created": (group: GroupChat) => void;
  "group:updated": (group: GroupChat) => void;
  "group:deleted": (data: { groupId: string; groupName: string; deletedByUserId: string }) => void;
  "group:member_left": (data: { groupId: string; userId: string; userName: string }) => void;
  "group:invitation": (invitation: GroupInvitationInfo) => void;
  "chugli:warning": (data: { groupId: string; groupName: string; expiresAt: string; remainingMinutes: number }) => void;
  "chugli:extended": (data: { group: GroupChat; expiresAt: string; additionalMinutes: number }) => void;
  "chugli:expired": (data: { groupId: string; groupName: string }) => void;
  "mm:state": (room: MMRoomState) => void;
  "mm:message": (message: MMMessage) => void;
  "mm:nightResult": (data: { eliminatedNames: string[]; everyoneSurvived: boolean }) => void;
  "mm:votingResult": (data: { eliminatedPlayer?: { id: string; name: string; role: MMRole }; isTie: boolean; isRunoff: boolean }) => void;
  "mm:gameOver": (data: { winnerTeam: "INNOCENTS" | "MURDERERS"; roles: Record<string, MMRole>; history: MMHistoryItem[] }) => void;
  "chess:state": (room: ChessGameState) => void;
  "chess:moveMade": (data: { move: ChessMove; room: ChessGameState }) => void;
  "chess:error": (data: { message: string }) => void;
  "ludo:state": (room: LudoGameState) => void;
  "ludo:diceRolled": (data: { color: LudoColor; value: number; canMove: boolean }) => void;
  "ludo:tokenMoved": (data: { color: LudoColor; tokenId: number; step: number; isHome: boolean }) => void;
  "ludo:error": (data: { message: string }) => void;
  "message:deleted": (data: {
    messageId: string;
    deleteFor: "me" | "everyone";
    deletedByUserId?: string;
    deletedByUsername?: string;
  }) => void;
  "message:edited": (data: {
    messageId: string;
    text: string;
    isEdited: boolean;
    editedAt?: string;
    groupId?: string;
    recipientId?: string;
    senderId: string;
  }) => void;
  "user:blocked": (data: { blockerId: string; targetUserId: string }) => void;
  "user:unblocked": (data: { blockerId: string; targetUserId: string }) => void;
  "user:favorite_online": (data: {
    userId: string;
    name: string;
    username: string;
  }) => void;
  "message:viewOnce:opened": (data: {
    messageId: string;
    userId: string;
    viewedAt: string;
    recipientId?: string;
    groupId?: string;
  }) => void;
  "game:chat:message": (message: GameChatMessage) => void;
  "game:voice:chunk": (data: GameVoiceChunk) => void;
  "game:voice:status": (data: GameVoiceStatus) => void;
  "friend:request:received": (request: FriendRequestInfo) => void;
  "friend:request:responded": (data: { requestId: string; status: "accepted" | "declined"; user: ChatUser }) => void;
  "friend:unfriended": (data: { userId: string; targetUserId: string }) => void;
  "chat:wallpaper_updated": (data: ChatWallpaperUpdatedEvent) => void;
  error: (error: { message: string }) => void;
}

export interface ChatWallpaperData {
  wallpaperUrl: string;
  scale?: number;
  translateX?: number;
  translateY?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface SetChatWallpaperPayload {
  userId: string;
  contactId: string;
  wallpaperUrl: string;
  scale?: number;
  translateX?: number;
  translateY?: number;
}

export interface RemoveChatWallpaperPayload {
  userId: string;
  contactId: string;
}

export interface ChatWallpaperUpdatedEvent {
  chatKey: string;
  user1Id: string;
  user2Id: string;
  wallpaper: ChatWallpaperData | null;
}

export interface ClientToServerEvents {
  "friend:request:send": (
    payload: SendFriendRequestPayload,
    callback?: (response: { status: "ok"; request?: FriendRequestInfo } | { status: "error"; message: string }) => void
  ) => void;
  "friend:request:respond": (
    payload: RespondFriendRequestPayload,
    callback?: (response: { status: "ok"; request?: FriendRequestInfo } | { status: "error"; message: string }) => void
  ) => void;
  "friend:unfriend": (
    payload: { userId: string; targetUserId: string },
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "user:alias:set": (
    payload: { userId: string; targetUserId: string; customName: string },
    callback?: (response: { status: "ok"; customName: string } | { status: "error"; message: string }) => void
  ) => void;
  "chat:set_wallpaper": (
    payload: SetChatWallpaperPayload,
    callback?: (response: { status: "ok"; wallpaper: ChatWallpaperData } | { status: "error"; message: string }) => void
  ) => void;
  "chat:remove_wallpaper": (
    payload: RemoveChatWallpaperPayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "chat:send": (
    payload: SendMessagePayload,
    callback?: (response: { status: "ok"; message?: ChatMessage } | { status: "error"; message: string }) => void
  ) => void;
  "message:viewOnce:open": (
    payload: { messageId: string; userId: string },
    callback?: (response: { status: "ok"; imageUrl?: string } | { status: "error"; message: string }) => void
  ) => void;
  "message:edit": (
    payload: EditMessagePayload,
    callback?: (response: { status: "ok"; message?: ChatMessage } | { status: "error"; message: string }) => void
  ) => void;
  "message:delete": (
    payload: DeleteMessagePayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "user:block": (
    payload: BlockUserPayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "user:unblock": (
    payload: BlockUserPayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "user:join": (
    payload: ChatUser,
    callback?: (response: { status: "ok"; user: ChatUser } | { status: "error"; message: string }) => void
  ) => void;

  "message:read": (payload: MarkReadPayload) => void;
  "group:create": (
    payload: CreateGroupPayload,
    callback?: (response: { status: "ok"; group?: GroupChat } | { status: "error"; message: string }) => void
  ) => void;
  "group:invite": (
    payload: InviteGroupMembersPayload,
    callback?: (response: { status: "ok"; group?: GroupChat } | { status: "error"; message: string }) => void
  ) => void;
  "group:respondInvite": (
    payload: RespondInvitationPayload,
    callback?: (response: { status: "ok"; group?: GroupChat } | { status: "error"; message: string }) => void
  ) => void;
  "group:delete": (
    payload: DeleteGroupPayload,
    callback?: (response: { status: "ok"; groupId?: string } | { status: "error"; message: string }) => void
  ) => void;
  "group:leave": (
    payload: LeaveGroupPayload,
    callback?: (response: { status: "ok"; group?: GroupChat | null; isDeleted?: boolean } | { status: "error"; message: string }) => void
  ) => void;
  "chugli:extend": (
    payload: ExtendChugliPayload,
    callback?: (response: { status: "ok"; group?: GroupChat } | { status: "error"; message: string }) => void
  ) => void;
  "chugli:end": (
    payload: { groupId: string; userId: string },
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "chugli:setAlias": (
    payload: SetChugliAliasPayload,
    callback?: (response: { status: "ok"; group?: GroupChat } | { status: "error"; message: string }) => void
  ) => void;
  "mm:create": (
    payload: CreateMMRoomPayload,
    callback?: (response: { status: "ok"; room?: MMRoomState } | { status: "error"; message: string }) => void
  ) => void;
  "mm:join": (
    payload: JoinMMRoomPayload,
    callback?: (response: { status: "ok"; room?: MMRoomState } | { status: "error"; message: string }) => void
  ) => void;
  "mm:ready": (
    payload: ToggleMMReadyPayload,
    callback?: (response: { status: "ok"; room?: MMRoomState } | { status: "error"; message: string }) => void
  ) => void;
  "mm:start": (
    payload: StartMMGamePayload,
    callback?: (response: { status: "ok"; room?: MMRoomState } | { status: "error"; message: string }) => void
  ) => void;
  "mm:viewedRole": (
    payload: ViewedMMRolePayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "mm:murdererAction": (
    payload: MMMurdererActionPayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "mm:healerAction": (
    payload: MMHealerActionPayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "mm:vote": (
    payload: MMCastVotePayload,
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;
  "mm:message": (
    payload: MMSendMessagePayload,
    callback?: (response: { status: "ok"; message?: MMMessage } | { status: "error"; message: string }) => void
  ) => void;
  "mm:playAgain": (
    payload: { roomId: string; userId: string },
    callback?: (response: { status: "ok"; room?: MMRoomState } | { status: "error"; message: string }) => void
  ) => void;
  "mm:leave": (
    payload: { roomId: string; userId: string },
    callback?: (response: { status: "ok" } | { status: "error"; message: string }) => void
  ) => void;

  // Chess socket events
  "chess:create": (
    payload: CreateChessRoomPayload,
    callback?: (response: { status: "ok"; room?: ChessGameState } | { status: "error"; message: string }) => void
  ) => void;
  "chess:join": (
    payload: JoinChessRoomPayload,
    callback?: (response: { status: "ok"; room?: ChessGameState } | { status: "error"; message: string }) => void
  ) => void;
  "chess:move": (
    payload: MoveChessPayload,
    callback?: (response: { status: "ok"; room?: ChessGameState } | { status: "error"; message: string }) => void
  ) => void;
  "chess:reset": (
    payload: ResetChessPayload,
    callback?: (response: { status: "ok"; room?: ChessGameState } | { status: "error"; message: string }) => void
  ) => void;
  "chess:leave": (
    payload: { roomId: string; userId: string },
    callback?: (response: { status: "ok"; room?: ChessGameState } | { status: "error"; message: string }) => void
  ) => void;

  // Ludo socket events (up to 6 players)
  "ludo:create": (
    payload: CreateLudoRoomPayload,
    callback?: (response: { status: "ok"; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;
  "ludo:join": (
    payload: JoinLudoRoomPayload,
    callback?: (response: { status: "ok"; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;
  "ludo:addBot": (
    payload: AddLudoBotPayload,
    callback?: (response: { status: "ok"; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;
  "ludo:start": (
    payload: StartLudoGamePayload,
    callback?: (response: { status: "ok"; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;
  "ludo:roll": (
    payload: RollLudoDicePayload,
    callback?: (response: { status: "ok"; value: number; canMove: boolean; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;
  "ludo:moveToken": (
    payload: MoveLudoTokenPayload,
    callback?: (response: { status: "ok"; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;
  "ludo:reset": (
    payload: ResetLudoPayload,
    callback?: (response: { status: "ok"; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;
  "ludo:leave": (
    payload: { roomId: string; userId: string },
    callback?: (response: { status: "ok"; room?: LudoGameState } | { status: "error"; message: string }) => void
  ) => void;

  // In-Game Live Chat & Voice Events
  "game:chat:send": (
    payload: {
      gameType: "chess" | "ludo" | "mm";
      roomId: string;
      senderId: string;
      senderName: string;
      senderColor?: string;
      text: string;
    },
    callback?: (response: { status: "ok"; message?: GameChatMessage } | { status: "error"; message: string }) => void
  ) => void;
  "game:voice:chunk": (payload: GameVoiceChunk) => void;
  "game:voice:status": (payload: GameVoiceStatus) => void;
}

// ==========================================
// IN-GAME LIVE CHAT & VOICE TYPES
// ==========================================
export interface GameChatMessage {
  id: string;
  gameType: "chess" | "ludo" | "mm";
  roomId: string;
  senderId: string;
  senderName: string;
  senderColor?: string;
  text: string;
  timestamp: number;
}

export interface GameVoiceChunk {
  gameType: "chess" | "ludo" | "mm";
  roomId: string;
  senderId: string;
  senderName: string;
  audioChunk: string;
  mimeType?: string;
}

export interface GameVoiceStatus {
  gameType: "chess" | "ludo" | "mm";
  roomId: string;
  userId: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

// ==========================================
// CHESS DEFINITIONS
// ==========================================
export type ChessColor = "w" | "b";
export type ChessPieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface ChessPiece {
  type: ChessPieceType;
  color: ChessColor;
}

export interface ChessMove {
  from: string; // e.g. "e2"
  to: string;   // e.g. "e4"
  piece: ChessPiece;
  captured?: ChessPiece;
  promotion?: ChessPieceType;
  notation: string;
}

export interface ChessPlayer {
  userId: string;
  name: string;
  username: string;
  color: ChessColor;
  connected: boolean;
  timeLeftSeconds?: number;
}

export interface ChessGameState {
  roomId: string;
  code: string;
  whitePlayer: ChessPlayer | null;
  blackPlayer: ChessPlayer | null;
  turn: ChessColor;
  board: (ChessPiece | null)[][]; // 8x8: [row][col], row 0 = rank 8 (Black), row 7 = rank 1 (White)
  moveHistory: ChessMove[];
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  winner: ChessColor | "draw" | null;
  status: "waiting" | "playing" | "game_over";
  lastMove?: { from: string; to: string };
  capturedWhite: ChessPiece[];
  capturedBlack: ChessPiece[];
  resignedBy?: string;
  resignedByName?: string;
}

export interface CreateChessRoomPayload {
  adminId: string;
  name: string;
  username: string;
  preferredColor?: ChessColor;
}

export interface JoinChessRoomPayload {
  code: string;
  userId: string;
  name: string;
  username: string;
}

export interface MoveChessPayload {
  roomId: string;
  userId: string;
  from: string;
  to: string;
  promotion?: ChessPieceType;
}

export interface ResetChessPayload {
  roomId: string;
  userId: string;
}

// ==========================================
// LUDO DEFINITIONS (UP TO 6 PLAYERS)
// ==========================================
export type LudoColor = "RED" | "GREEN" | "YELLOW" | "BLUE" | "PURPLE" | "ORANGE";

export interface LudoToken {
  id: number; // 0, 1, 2, 3
  color: LudoColor;
  step: number; // -1 = In Yard, 0..51/71 = Track steps, 100+ = Home stretch, 999 = Finished Home!
  isHome: boolean;
  inYard: boolean;
}

export interface LudoPlayer {
  id: string;
  userId: string;
  name: string;
  username: string;
  color: LudoColor;
  isBot?: boolean;
  tokens: LudoToken[];
  rank?: number; // 1st, 2nd, etc.
  hasFinished: boolean;
  isForfeited?: boolean;
  consecutiveSixes: number;
}

export interface LudoGameState {
  roomId: string;
  code: string;
  adminId: string;
  maxPlayers: number; // 2 to 6
  players: LudoPlayer[];
  currentTurnColor: LudoColor;
  diceValue: number | null;
  hasRolled: boolean;
  status: "waiting" | "playing" | "game_over";
  winnerList: { color: LudoColor; name: string; rank: number }[];
  lastActionText?: string;
  canRoll: boolean;
  movableTokens: number[]; // token IDs that can move given current dice
  /** Last rolled value — persists across turn changes until the next roll */
  lastDiceValue?: number | null;
  /** Color of the player who made the last roll */
  lastDiceColor?: LudoColor | null;
}

export interface CreateLudoRoomPayload {
  adminId: string;
  name: string;
  username: string;
  maxPlayers: number; // 2..6
  color?: LudoColor;
}

export interface JoinLudoRoomPayload {
  code: string;
  userId: string;
  name: string;
  username: string;
  color?: LudoColor;
}

export interface AddLudoBotPayload {
  roomId: string;
  color?: LudoColor;
}

export interface StartLudoGamePayload {
  roomId: string;
  userId: string;
}

export interface RollLudoDicePayload {
  roomId: string;
  userId: string;
}

export interface MoveLudoTokenPayload {
  roomId: string;
  userId: string;
  tokenId: number;
}

export interface ResetLudoPayload {
  roomId: string;
  userId: string;
}

export interface WallpaperPreset {
  id: string;
  name: string;
  category: "gradient" | "dark" | "artistic" | "vibrant";
  colors: [string, string, ...string[]];
  accentColor: string;
  description?: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: "amoled_pitch",
    name: "AMOLED Pitch",
    category: "dark",
    colors: ["#000000", "#09090b", "#000000"],
    accentColor: "#3b82f6",
    description: "Pure black minimalism with subtle vignette for OLED screens",
  },
  {
    id: "whatsapp_classic",
    name: "Classic WhatsApp Dark",
    category: "dark",
    colors: ["#0b141a", "#111b21", "#0c151c"],
    accentColor: "#00a884",
    description: "Authentic, eye-friendly messenger dark slate",
  },
  {
    id: "neon_cyberpunk",
    name: "Neon Cyberpunk",
    category: "vibrant",
    colors: ["#14052b", "#2a0845", "#0b0217"],
    accentColor: "#a855f7",
    description: "Vibrant synthwave violet with deep space shadows",
  },
  {
    id: "sunset_dusk",
    name: "Sunset Twilight",
    category: "artistic",
    colors: ["#2d112c", "#441838", "#1c0c1b"],
    accentColor: "#ec4899",
    description: "Warm romantic dusk tones and deep plum gradient",
  },
  {
    id: "emerald_forest",
    name: "Emerald Forest",
    category: "artistic",
    colors: ["#05231a", "#0d3c2c", "#03140e"],
    accentColor: "#10b981",
    description: "Deep soothing pine and rainforest green",
  },
  {
    id: "ocean_abyss",
    name: "Ocean Abyss",
    category: "gradient",
    colors: ["#031926", "#092d42", "#011019"],
    accentColor: "#0ea5e9",
    description: "Submerged marine blue with crystal oceanic tones",
  },
  {
    id: "cozy_mocha",
    name: "Cozy Mocha",
    category: "artistic",
    colors: ["#231815", "#392520", "#18100d"],
    accentColor: "#f59e0b",
    description: "Warm roasted espresso & hazelnut warmth",
  },
  {
    id: "crimson_eclipse",
    name: "Crimson Eclipse",
    category: "vibrant",
    colors: ["#28090d", "#421016", "#160406"],
    accentColor: "#ef4444",
    description: "Passionate deep burgundy with dramatic dark contrast",
  },
  {
    id: "aurora_borealis",
    name: "Aurora Teal",
    category: "gradient",
    colors: ["#07202f", "#113848", "#081d27"],
    accentColor: "#14b8a6",
    description: "Hypnotic northern lights teal with cosmic dark navy",
  },
  {
    id: "lavender_dream",
    name: "Lavender Twilight",
    category: "gradient",
    colors: ["#211a38", "#332654", "#151025"],
    accentColor: "#8b5cf6",
    description: "Soft velvet violet gradient for late night chats",
  },
  {
    id: "glacier_frost",
    name: "Glacier Frost",
    category: "gradient",
    colors: ["#0c233c", "#143a5e", "#071626"],
    accentColor: "#38bdf8",
    description: "Cool arctic chill with premium glass sheen",
  },
  {
    id: "carbon_mesh",
    name: "Carbon Slate",
    category: "dark",
    colors: ["#111827", "#1f2937", "#0f172a"],
    accentColor: "#64748b",
    description: "Modern stealth graphite for clean focus",
  },
];

export const WALLPAPER_SOLID_COLORS: { name: string; hex: string }[] = [
  { name: "Default Dark", hex: "#0F172A" },
  { name: "Pure OLED Black", hex: "#000000" },
  { name: "WhatsApp Slate", hex: "#0B141A" },
  { name: "Midnight Navy", hex: "#0A192F" },
  { name: "Indigo Velvet", hex: "#1E1B4B" },
  { name: "Royal Purple", hex: "#2E1065" },
  { name: "Forest Green", hex: "#064E3B" },
  { name: "Deep Teal", hex: "#134E4A" },
  { name: "Ocean Sapphire", hex: "#0C4A6E" },
  { name: "Wine Burgundy", hex: "#4C0519" },
  { name: "Warm Espresso", hex: "#291811" },
  { name: "Charcoal Smoke", hex: "#1C1917" },
  { name: "Zinc Gunmetal", hex: "#18181B" },
  { name: "Steel Twilight", hex: "#1E293B" },
];


