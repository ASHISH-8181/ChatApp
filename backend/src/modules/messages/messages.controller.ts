import { Hono } from "hono";
import { messagesService } from "./messages.service.js";
import type {
  SendMessagePayload,
  RegisterUserPayload,
  LoginUserPayload,
  CreateGroupPayload,
  InviteGroupMembersPayload,
} from "@chatapp/shared";

export const messagesRouter = new Hono();

// Fetch messages: supports global, personal 1-on-1 (recipientId + currentUserId), or group (groupId)
messagesRouter.get("/", async (c) => {
  try {
    const recipientId = c.req.query("recipientId");
    const currentUserId = c.req.query("currentUserId");
    const groupId = c.req.query("groupId");

    const messages = await messagesService.getRecentMessages({
      recipientId,
      currentUserId,
      groupId,
    });
    return c.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load messages";
    return c.json({ error: message }, 500);
  }
});

messagesRouter.post("/", async (c) => {
  try {
    const body = await c.req.json<SendMessagePayload>();
    const message = await messagesService.saveMessage(body);
    return c.json({ message }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save message";
    return c.json({ error: message }, 400);
  }
});

messagesRouter.post("/:id/delete", async (c) => {
  try {
    const messageId = c.req.param("id");
    const body = await c.req.json<{ userId: string; deleteFor: "me" | "everyone" }>();
    const result = await messagesService.deleteMessage({
      messageId,
      userId: body.userId,
      deleteFor: body.deleteFor,
    });
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete message";
    return c.json({ error: message }, 400);
  }
});

// Clear all messages in a conversation for the current user
messagesRouter.post("/clear", async (c) => {
  try {
    const body = await c.req.json<{
      currentUserId: string;
      recipientId?: string;
      groupId?: string;
    }>();
    if (!body.currentUserId) {
      return c.json({ error: "currentUserId is required" }, 400);
    }
    const result = await messagesService.clearChat(body);
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear chat";
    return c.json({ error: message }, 400);
  }
});

// Live translate message text (English to Hindi or other target language)
messagesRouter.post("/translate", async (c) => {
  try {
    const body = await c.req.json<{ text: string; targetLang?: string }>();
    if (!body?.text) {
      return c.json({ error: "text is required" }, 400);
    }
    const result = await messagesService.translateText(body.text, body.targetLang || "hi");
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate message";
    return c.json({ error: message }, 500);
  }
});

export const usersRouter = new Hono();

// List all registered users (supports optional search query by username or name)
usersRouter.get("/", async (c) => {
  try {
    const q = c.req.query("q") || c.req.query("username");
    const users = await messagesService.getAllUsers(q);
    return c.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch users";
    return c.json({ error: message }, 500);
  }
});

// Block a user
usersRouter.post("/block", async (c) => {
  try {
    const body = await c.req.json<{ blockerId: string; targetUserId: string }>();
    await messagesService.blockUser(body.blockerId, body.targetUserId);
    return c.json({ status: "ok" }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to block user";
    return c.json({ error: message }, 400);
  }
});

// Unblock a user
usersRouter.post("/unblock", async (c) => {
  try {
    const body = await c.req.json<{ blockerId: string; targetUserId: string }>();
    await messagesService.unblockUser(body.blockerId, body.targetUserId);
    return c.json({ status: "ok" }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unblock user";
    return c.json({ error: message }, 400);
  }
});

// Get blocked users list & IDs for a user
usersRouter.get("/blocked", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ error: "userId is required" }, 400);
    }
    const blockedUsers = await messagesService.getBlockedUsers(userId);
    const blockedUserIds = await messagesService.getBlockedUserIds(userId);
    return c.json({ blockedUsers, blockedUserIds }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch blocked users";
    return c.json({ error: message }, 500);
  }
});

// Toggle favorite user
usersRouter.post("/favorites/toggle", async (c) => {
  try {
    const body = await c.req.json<{ userId: string; favoriteUserId: string }>();
    if (!body.userId || !body.favoriteUserId) {
      return c.json({ error: "userId and favoriteUserId are required" }, 400);
    }
    const result = await messagesService.toggleFavoriteUser(body.userId, body.favoriteUserId);
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to toggle favorite user";
    return c.json({ error: message }, 400);
  }
});

// Add favorite user
usersRouter.post("/favorites/add", async (c) => {
  try {
    const body = await c.req.json<{ userId: string; favoriteUserId: string }>();
    if (!body.userId || !body.favoriteUserId) {
      return c.json({ error: "userId and favoriteUserId are required" }, 400);
    }
    await messagesService.addFavoriteUser(body.userId, body.favoriteUserId);
    return c.json({ status: "ok", isFavorite: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add favorite user";
    return c.json({ error: message }, 400);
  }
});

// Remove favorite user
usersRouter.post("/favorites/remove", async (c) => {
  try {
    const body = await c.req.json<{ userId: string; favoriteUserId: string }>();
    if (!body.userId || !body.favoriteUserId) {
      return c.json({ error: "userId and favoriteUserId are required" }, 400);
    }
    await messagesService.removeFavoriteUser(body.userId, body.favoriteUserId);
    return c.json({ status: "ok", isFavorite: false }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove favorite user";
    return c.json({ error: message }, 400);
  }
});

// Get favorite user IDs for a user
usersRouter.get("/favorites", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ error: "userId is required" }, 400);
    }
    const favoriteUserIds = await messagesService.getFavoriteUserIds(userId);
    return c.json({ favoriteUserIds }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch favorite users";
    return c.json({ error: message }, 500);
  }
});

// Check if a user profile exists for a Clerk User ID
usersRouter.get("/by-clerk/:clerkId", async (c) => {
  try {
    const clerkId = c.req.param("clerkId");
    const email = c.req.query("email");
    const user = await messagesService.getUserByClerkId(clerkId, email);
    if (!user) {
      return c.json({ exists: false, message: "Profile creation required" }, 200);
    }
    return c.json({ exists: true, user }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify Clerk user";
    return c.json({ error: message }, 500);
  }
});

// Check if username or phoneNumber is available
usersRouter.post("/check-availability", async (c) => {
  try {
    const body = (await c.req.json()) as { username?: string; phoneNumber?: string };
    const result = await messagesService.checkAvailability(body.username, body.phoneNumber);
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check failed";
    return c.json({ error: message }, 400);
  }
});

// Register new user profile (name, unique username, unique phoneNumber, password, clerkId)
usersRouter.post("/register", async (c) => {
  try {
    const body = (await c.req.json()) as RegisterUserPayload;
    const user = await messagesService.registerUser(body);
    return c.json({ user }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return c.json({ error: message }, 400);
  }
});

// Sign in with username / phone number and password
usersRouter.post("/login", async (c) => {
  try {
    const body = (await c.req.json()) as LoginUserPayload;
    const user = await messagesService.loginUser(body.identifier, body.password);
    return c.json({ user }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    const status = message.includes("Incorrect password") || message.includes("Password is required") ? 401 : 404;
    return c.json({ error: message }, status);
  }
});

// Update user profile (display name, avatarUrl; username and phone number are strictly immutable)
const handleUpdateProfile = async (c: any) => {
  try {
    const id = c.req.param("id");
    const body = (await c.req.json()) as { name?: string; avatarUrl?: string | null };
    if (body.name === undefined && body.avatarUrl === undefined) {
      return c.json({ error: "Display name or avatarUrl is required." }, 400);
    }
    const user = await messagesService.updateUserProfile(id, body);
    return c.json({ user }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update profile";
    return c.json({ error: message }, 400);
  }
};

usersRouter.patch("/:id", handleUpdateProfile);
usersRouter.post("/:id", handleUpdateProfile);

// Get user's private contact aliases (custom nicknames)
usersRouter.get("/:id/contact-aliases", async (c) => {
  try {
    const id = c.req.param("id");
    const aliases = await messagesService.getContactAliases(id);
    return c.json({ aliases }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load aliases";
    return c.json({ error: message }, 500);
  }
});

// Set or update a user's private contact alias
usersRouter.post("/:id/contact-aliases", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{ targetUserId: string; customName: string }>();
    if (!body.targetUserId) {
      return c.json({ error: "targetUserId is required" }, 400);
    }
    const result = await messagesService.setContactAlias(id, body.targetUserId, body.customName);
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set alias";
    return c.json({ error: message }, 400);
  }
});

// Delete a user's private contact alias (reset to default name)
usersRouter.delete("/:id/contact-aliases/:targetUserId", async (c) => {
  try {
    const id = c.req.param("id");
    const targetUserId = c.req.param("targetUserId");
    const result = await messagesService.deleteContactAlias(id, targetUserId);
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete alias";
    return c.json({ error: message }, 400);
  }
});


// --- Groups / Channels Router ---
export const groupsRouter = new Hono();

groupsRouter.get("/", async (c) => {
  try {
    const userId = c.req.query("userId");
    const groups = await messagesService.getGroups(userId);
    return c.json({ groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load groups";
    return c.json({ error: message }, 500);
  }
});

// Get pending group invitations for a user
groupsRouter.get("/invitations", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ error: "userId is required" }, 400);
    }
    const invitations = await messagesService.getUserInvitations(userId);
    return c.json({ invitations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load invitations";
    return c.json({ error: message }, 500);
  }
});

groupsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json<CreateGroupPayload>();
    const result = await messagesService.createGroup(body);
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create group";
    return c.json({ error: message }, 400);
  }
});

groupsRouter.post("/:id/invite", async (c) => {
  try {
    const groupId = c.req.param("id");
    const body = await c.req.json<{ senderId: string; memberUserIds: string[] }>();
    const result = await messagesService.inviteMembersToGroup({
      groupId,
      senderId: body.senderId,
      memberUserIds: body.memberUserIds || [],
    });
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to invite members";
    return c.json({ error: message }, 400);
  }
});

// Accept or decline group invitation
groupsRouter.post("/invitations/:id/respond", async (c) => {
  try {
    const invitationId = c.req.param("id");
    const body = await c.req.json<{ userId: string; response: "accept" | "decline" }>();
    const group = await messagesService.respondToInvitation({
      invitationId,
      userId: body.userId,
      response: body.response,
    });
    return c.json({ group }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to respond to invitation";
    return c.json({ error: message }, 400);
  }
});

// Extend Chugli group session duration
groupsRouter.post("/:id/chugli/extend", async (c) => {
  try {
    const groupId = c.req.param("id");
    const body = await c.req.json<{ userId: string; additionalMinutes: number }>();
    const group = await messagesService.extendChugliGroup(
      groupId,
      body.userId,
      body.additionalMinutes || 30
    );
    return c.json({ group }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extend Chugli group";
    return c.json({ error: message }, 400);
  }
});

// End Chugli group session immediately
groupsRouter.post("/:id/chugli/end", async (c) => {
  try {
    const groupId = c.req.param("id");
    const body = await c.req.json<{ userId: string }>();
    const result = await messagesService.endChugliGroup(groupId, body.userId);
    return c.json({ status: "ok", group: result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to end Chugli group";
    return c.json({ error: message }, 400);
  }
});

// Set or update secret alias for Chugli group member
groupsRouter.post("/:id/chugli/alias", async (c) => {
  try {
    const groupId = c.req.param("id");
    const body = await c.req.json<{ userId: string; alias: string }>();
    const group = await messagesService.setMemberAlias(groupId, body.userId, body.alias);
    return c.json({ group }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set alias";
    return c.json({ error: message }, 400);
  }
});

// Delete group permanently (Admin only)
groupsRouter.delete("/:id", async (c) => {
  try {
    const groupId = c.req.param("id");
    let userId = c.req.query("userId");
    if (!userId) {
      const body = await c.req.json<{ userId: string }>().catch(() => null);
      userId = body?.userId;
    }
    if (!userId) {
      return c.json({ error: "userId is required to delete a group" }, 400);
    }
    const result = await messagesService.deleteGroup(groupId, userId);
    return c.json({ status: "ok", group: result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete group";
    return c.json({ error: message }, 400);
  }
});

groupsRouter.post("/:id/delete", async (c) => {
  try {
    const groupId = c.req.param("id");
    let userId = c.req.query("userId");
    if (!userId) {
      const body = await c.req.json<{ userId: string }>().catch(() => null);
      userId = body?.userId;
    }
    if (!userId) {
      return c.json({ error: "userId is required to delete a group" }, 400);
    }
    const result = await messagesService.deleteGroup(groupId, userId);
    return c.json({ status: "ok", group: result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete group";
    return c.json({ error: message }, 400);
  }
});

// Leave / exit group
groupsRouter.post("/:id/leave", async (c) => {
  try {
    const groupId = c.req.param("id");
    let userId = c.req.query("userId");
    if (!userId) {
      const body = (await c.req.json().catch(() => null)) as { userId?: string } | null;
      userId = body?.userId;
    }
    if (!userId) {
      return c.json({ error: "userId is required to leave group" }, 400);
    }
    const result = await messagesService.leaveGroup(groupId, userId);
    return c.json({ status: "ok", ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to leave group";
    return c.json({ error: message }, 400);
  }
});

export const friendsRouter = new Hono();

// Send friend request by username
friendsRouter.post("/request", async (c) => {
  try {
    const body = await c.req.json<{ senderId: string; targetUsername: string }>();
    if (!body.senderId || !body.targetUsername) {
      return c.json({ error: "senderId and targetUsername are required" }, 400);
    }
    const request = await messagesService.sendFriendRequest(body.senderId, body.targetUsername);
    return c.json({ status: "ok", request }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send friend request";
    return c.json({ error: message }, 400);
  }
});

// Respond to friend request (accept or declined)
friendsRouter.post("/respond", async (c) => {
  try {
    const body = await c.req.json<{ requestId: string; userId: string; action: "accept" | "declined" }>();
    if (!body.requestId || !body.userId || !body.action) {
      return c.json({ error: "requestId, userId, and action ('accept' | 'declined') are required" }, 400);
    }
    const request = await messagesService.respondFriendRequest(body.requestId, body.userId, body.action);
    return c.json({ status: "ok", request }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to respond to friend request";
    return c.json({ error: message }, 400);
  }
});

// Get user's friends and pending requests
friendsRouter.get("/list/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const data = await messagesService.getUserFriends(userId);
    return c.json(data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch friends";
    return c.json({ error: message }, 400);
  }
});

// Check friendship status between two users
friendsRouter.get("/status/:userId/:targetUserId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const targetUserId = c.req.param("targetUserId");
    const data = await messagesService.getFriendshipStatus(userId, targetUserId);
    return c.json(data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch friendship status";
    return c.json({ error: message }, 400);
  }
});

// Unfriend a user
friendsRouter.post("/unfriend", async (c) => {
  try {
    const body = await c.req.json<{ userId: string; targetUserId: string }>();
    if (!body.userId || !body.targetUserId) {
      return c.json({ error: "userId and targetUserId are required" }, 400);
    }
    const result = await messagesService.unfriendUser(body.userId, body.targetUserId);
    return c.json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unfriend user";
    return c.json({ error: message }, 400);
  }
});

