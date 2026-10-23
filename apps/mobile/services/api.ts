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
  CreateMMRoomPayload,
  JoinMMRoomPayload,
  MMRoomState,
  MMMessage,
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

export async function loginUser(identifier: string): Promise<ChatUser> {
  const url = `${getServerUrl()}/api/users/login`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ identifier }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Login failed (${response.status})`);
  }

  return data.user;
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

export async function updateUserDisplayName(
  userId: string,
  name: string
): Promise<ChatUser> {
  const url = `${getServerUrl()}/api/users/${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to update profile name");
  }

  return data.user;
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
  const url = `${getServerUrl()}/api/groups/${encodeURIComponent(groupId)}/chugli/end`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to end Chugli session");
  }
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

