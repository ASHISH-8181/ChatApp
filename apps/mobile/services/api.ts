import { Platform } from "react-native";
import Constants from "expo-constants";
import type {
  ChatMessage,
  ChatUser,
  CreateGroupPayload,
  GroupChat,
  GroupInvitationInfo,
  HealthResponse,
  InviteGroupMembersPayload,
  RegisterUserPayload,
  ClerkAuthCheckResponse,
  CheckAvailabilityResponse,
  CreateMMRoomPayload,
  JoinMMRoomPayload,
  MMRoomState,
  MMMessage,
  FriendRequestInfo,
  FriendStatusResponse,
} from "@chatapp/shared";

function resolveDefaultServerUrl(): string {
  // 1. Try to read the Metro host IP on physical devices / Expo Go (e.g. 192.168.1.15:8083 -> 192.168.1.15:3000)
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.hostUri;

  if (hostUri) {
    const ip = hostUri.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return `http://${ip}:3000`;
    }
  }

  // 2. Explicit environment variable
  if (process.env.EXPO_PUBLIC_API_URL) {
    const envUrl = process.env.EXPO_PUBLIC_API_URL.trim();
    if (Platform.OS === "android" && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      return "http://192.168.1.15:3000";
    }
    return envUrl;
  }

  // 3. Android physical or LAN fallback
  if (Platform.OS === "android") {
    return "http://192.168.1.15:3000";
  }

  return "http://localhost:3000";
}

let activeServerUrl: string = resolveDefaultServerUrl();

export function getServerUrl(): string {
  return activeServerUrl;
}

export function setServerUrl(url: string): void {
  let formatted = url.trim();
  if (formatted.endsWith("/")) {
    formatted = formatted.slice(0, -1);
  }

  // If running on Android and URL refers to localhost or 127.0.0.1, auto-translate to host IP
  if (Platform.OS === "android" && (formatted.includes("localhost") || formatted.includes("127.0.0.1"))) {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any).manifest?.hostUri;
    const ip = hostUri ? hostUri.split(":")[0] : "192.168.1.15";
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      formatted = formatted.replace("localhost", ip).replace("127.0.0.1", ip);
    }
  }

  activeServerUrl = formatted;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const url = `${getServerUrl()}/health`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }

  return response.json();
}

export async function fetchMessageHistory(params?: {
  recipientId?: string;
  currentUserId?: string;
  groupId?: string;
}): Promise<ChatMessage[]> {
  const queryParts: string[] = [];
  if (params?.recipientId) queryParts.push(`recipientId=${encodeURIComponent(params.recipientId)}`);
  if (params?.currentUserId) queryParts.push(`currentUserId=${encodeURIComponent(params.currentUserId)}`);
  if (params?.groupId) queryParts.push(`groupId=${encodeURIComponent(params.groupId)}`);

  const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  const url = `${getServerUrl()}/api/messages${qs}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch messages: ${response.status}`);
  }

  const data = await response.json();
  return data.messages || [];
}

export async function registerUserProfile(
  payload: RegisterUserPayload
): Promise<ChatUser> {
  const url = `${getServerUrl()}/api/users/register`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Registration failed (${response.status})`);
  }

  return data.user;
}

export async function loginUser(
  identifier: string,
  password?: string
): Promise<ChatUser> {
  const url = `${getServerUrl()}/api/users/login`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ identifier, password }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Login failed (${response.status})`);
  }

  return data.user;
}

export async function checkClerkUserProfile(
  clerkId: string,
  email?: string
): Promise<ClerkAuthCheckResponse> {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  const url = `${getServerUrl()}/api/users/by-clerk/${encodeURIComponent(clerkId)}${query}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Failed to verify account (${response.status})`);
  }

  return data;
}

export async function checkAvailability(
  username?: string,
  phoneNumber?: string
): Promise<CheckAvailabilityResponse> {
  const url = `${getServerUrl()}/api/users/check-availability`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, phoneNumber }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { usernameAvailable: true, phoneAvailable: true };
  }

  return data;
}

export async function fetchAllUsers(query?: string): Promise<ChatUser[]> {
  const base = `${getServerUrl()}/api/users`;
  const url = query ? `${base}?q=${encodeURIComponent(query)}` : base;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load registered users");
  }

  const data = await response.json();
  return data.users || [];
}

export async function updateUserProfile(
  userId: string,
  payload: { name?: string; avatarUrl?: string | null }
): Promise<ChatUser> {
  const url = `${getServerUrl()}/api/users/${encodeURIComponent(userId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to update profile");
  }

  return data.user;
}

export async function updateUserDisplayName(
  userId: string,
  name: string
): Promise<ChatUser> {
  return updateUserProfile(userId, { name });
}

// --- Groups / Channels API ---

export async function fetchGroups(userId?: string): Promise<GroupChat[]> {
  const base = `${getServerUrl()}/api/groups`;
  const url = userId ? `${base}?userId=${encodeURIComponent(userId)}` : base;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load groups");
  }

  const data = await response.json();
  return data.groups || [];
}

export async function createGroup(payload: CreateGroupPayload): Promise<GroupChat> {
  const url = `${getServerUrl()}/api/groups`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to create group");
  }

  return data.group;
}

export async function inviteGroupMembers(
  payload: InviteGroupMembersPayload
): Promise<GroupChat> {
  const url = `${getServerUrl()}/api/groups/${encodeURIComponent(payload.groupId)}/invite`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ senderId: payload.senderId, memberUserIds: payload.memberUserIds }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to invite members to group");
  }

  return data.group;
}

export async function fetchUserInvitations(userId: string): Promise<GroupInvitationInfo[]> {
  const url = `${getServerUrl()}/api/groups/invitations?userId=${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load invitations");
  }

  const data = await response.json();
  return data.invitations || [];
}

export async function respondToGroupInvitation(
  invitationId: string,
  userId: string,
  responseType: "accept" | "decline",
  anonymousAlias?: string
): Promise<GroupChat> {
  const url = `${getServerUrl()}/api/groups/invitations/${encodeURIComponent(invitationId)}/respond`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ userId, response: responseType, anonymousAlias }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to respond to invitation");
  }

  return data.group;
}

export async function extendChugliSession(
  groupId: string,
  userId: string,
  additionalMinutes: number
): Promise<GroupChat> {
  const url = `${getServerUrl()}/api/groups/${encodeURIComponent(groupId)}/chugli/extend`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ userId, additionalMinutes }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to extend Chugli session");
  }

  return data.group;
}

export async function endChugliSession(groupId: string, userId: string): Promise<void> {
  await deleteGroup(groupId, userId);
}

export async function deleteGroup(
  groupId: string,
  userId: string
): Promise<{ success: boolean; id?: string; name?: string }> {
  const url = `${getServerUrl()}/api/groups/${encodeURIComponent(groupId)}?userId=${encodeURIComponent(userId)}`;
  let response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ userId }),
  }).catch(() => null);

  // Fallback to POST /api/groups/:id/delete if DELETE fails or is blocked by network proxy
  if (!response || !response.ok) {
    const postUrl = `${getServerUrl()}/api/groups/${encodeURIComponent(groupId)}/delete`;
    response = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ userId }),
    });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete group");
  }

  return { success: true, id: data.group?.id, name: data.group?.name };
}

export async function leaveGroup(
  groupId: string,
  userId: string
): Promise<{ status: string; group: GroupChat | null; isDeleted: boolean; groupName: string }> {
  const url = `${getServerUrl()}/api/groups/${encodeURIComponent(groupId)}/leave`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to leave group");
  }

  return data;
}

export async function setChugliMemberAlias(
  groupId: string,
  userId: string,
  alias: string
): Promise<GroupChat> {
  const url = `${getServerUrl()}/api/groups/${encodeURIComponent(groupId)}/chugli/alias`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ userId, alias }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to set secret alias");
  }

  return data.group;
}

// ==========================================
// Murder Mystery API
// ==========================================

export async function createMMRoom(payload: CreateMMRoomPayload): Promise<MMRoomState> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to create Murder Mystery room");
  return data.room;
}

export async function joinMMRoom(payload: JoinMMRoomPayload): Promise<MMRoomState> {
  const url = `${getServerUrl()}/api/murder-mystery/join`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to join room");
  return data.room;
}

export async function fetchMMRoom(roomId: string, userId: string): Promise<MMRoomState> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}?userId=${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to load Murder Mystery room");
  return data.room;
}

export async function toggleMMReady(roomId: string, userId: string, isReady: boolean): Promise<MMRoomState> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/ready`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, isReady }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to change ready status");
  return data.room;
}

export async function startMMGame(roomId: string, userId: string): Promise<MMRoomState> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/start`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to start game");
  return data.room;
}

export async function viewedMMRole(roomId: string, userId: string): Promise<void> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/viewed-role`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to acknowledge role");
  }
}

export async function submitMMMurdererAction(roomId: string, userId: string, targetUserId: string): Promise<void> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/murder`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, targetUserId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to submit murder action");
  }
}

export async function submitMMHealerAction(roomId: string, userId: string, targetUserId: string): Promise<void> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/heal`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, targetUserId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to submit healing action");
  }
}

export async function castMMVote(roomId: string, userId: string, targetUserId: string): Promise<void> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/vote`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, targetUserId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to cast vote");
  }
}

export async function sendMMMessage(roomId: string, userId: string, text: string): Promise<MMMessage> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to send message");
  return data.message;
}

export async function playAgainMMRoom(roomId: string, userId: string): Promise<MMRoomState> {
  const url = `${getServerUrl()}/api/murder-mystery/rooms/${encodeURIComponent(roomId)}/play-again`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to restart game");
  return data.room;
}

export async function deleteMessageApi(
  messageId: string,
  userId: string,
  deleteFor: "me" | "everyone"
): Promise<{ status: "ok" }> {
  const url = `${getServerUrl()}/api/messages/${encodeURIComponent(messageId)}/delete`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, deleteFor }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to delete message");
  return data;
}

export async function blockUserApi(
  blockerId: string,
  targetUserId: string
): Promise<void> {
  const url = `${getServerUrl()}/api/users/block`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ blockerId, targetUserId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to block user");
}

export async function unblockUserApi(
  blockerId: string,
  targetUserId: string
): Promise<void> {
  const url = `${getServerUrl()}/api/users/unblock`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ blockerId, targetUserId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to unblock user");
}

export async function fetchBlockedUsersApi(
  userId: string
): Promise<{ blockedUsers: ChatUser[]; blockedUserIds: string[] }> {
  const url = `${getServerUrl()}/api/users/blocked?userId=${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to fetch blocked users");
  return {
    blockedUsers: data.blockedUsers || [],
    blockedUserIds: data.blockedUserIds || [],
  };
}

// --- Favorite Users API ---

export async function toggleFavoriteUserApi(
  userId: string,
  favoriteUserId: string
): Promise<{ isFavorite: boolean; favoriteUserIds: string[] }> {
  const url = `${getServerUrl()}/api/users/favorites/toggle`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, favoriteUserId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to update favorite status");
  return {
    isFavorite: Boolean(data.isFavorite),
    favoriteUserIds: data.favoriteUserIds || (data.isFavorite ? [favoriteUserId] : []),
  };
}

export async function fetchFavoriteUserIdsApi(userId: string): Promise<string[]> {
  const url = `${getServerUrl()}/api/users/favorites?userId=${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to load favorites");
  return data.favoriteUserIds || [];
}

export async function uploadImageApi(
  base64OrDataUri: string,
  folder = "chatapp/view_once"
): Promise<{ url: string; publicId: string }> {
  const url = `${getServerUrl()}/api/upload/image`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ image: base64OrDataUri, folder }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to upload image");
  return {
    url: data.url,
    publicId: data.publicId,
  };
}

export async function clearChatApi(params: {
  currentUserId: string;
  recipientId?: string;
  groupId?: string;
}): Promise<{ clearedCount: number }> {
  const url = `${getServerUrl()}/api/messages/clear`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to clear chat");
  return data;
}

export async function sendFriendRequestApi(
  senderId: string,
  targetUsername: string
): Promise<{ status: string; request: FriendRequestInfo }> {
  const url = `${getServerUrl()}/api/friends/request`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ senderId, targetUsername }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to send friend request");
  return data;
}

export async function respondFriendRequestApi(
  requestId: string,
  userId: string,
  action: "accept" | "declined"
): Promise<{ status: string; request: FriendRequestInfo }> {
  const url = `${getServerUrl()}/api/friends/respond`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ requestId, userId, action }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to respond to friend request");
  return data;
}

export async function fetchUserFriendsApi(userId: string): Promise<{
  friends: ChatUser[];
  friendIds: string[];
  incomingRequests: FriendRequestInfo[];
  outgoingRequests: FriendRequestInfo[];
}> {
  const url = `${getServerUrl()}/api/friends/list/${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to fetch friends list");
  return {
    friends: data.friends || [],
    friendIds: data.friendIds || [],
    incomingRequests: data.incomingRequests || [],
    outgoingRequests: data.outgoingRequests || [],
  };
}

export async function fetchFriendshipStatusApi(
  userId: string,
  targetUserId: string
): Promise<FriendStatusResponse> {
  const url = `${getServerUrl()}/api/friends/status/${encodeURIComponent(userId)}/${encodeURIComponent(targetUserId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to fetch friendship status");
  return {
    status: data.status || "none",
    requestId: data.requestId,
    isFriend: Boolean(data.isFriend),
  };
}

export async function unfriendUserApi(
  userId: string,
  targetUserId: string
): Promise<{ success: boolean; targetUserId: string }> {
  const url = `${getServerUrl()}/api/friends/unfriend`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, targetUserId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to unfriend user");
  return data;
}

export async function fetchContactAliasesApi(userId: string): Promise<Record<string, string>> {
  try {
    const url = `${getServerUrl()}/api/users/${encodeURIComponent(userId)}/contact-aliases`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return {};
    const data = await response.json().catch(() => ({}));
    return data.aliases || {};
  } catch {
    return {};
  }
}

export async function setContactAliasApi(
  userId: string,
  targetUserId: string,
  customName: string
): Promise<{ success: boolean; customName: string }> {
  const url = `${getServerUrl()}/api/users/${encodeURIComponent(userId)}/contact-aliases`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ targetUserId, customName }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to set custom nickname");
  return data;
}

export async function deleteContactAliasApi(
  userId: string,
  targetUserId: string
): Promise<{ success: boolean }> {
  const url = `${getServerUrl()}/api/users/${encodeURIComponent(userId)}/contact-aliases/${encodeURIComponent(targetUserId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to reset contact name");
  return data;
}

export async function translateMessageApi(
  text: string,
  targetLang = "hi"
): Promise<{ original: string; translated: string; targetLang: string }> {
  const url = `${getServerUrl()}/api/messages/translate`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text, targetLang }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to translate message");
    return data;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

