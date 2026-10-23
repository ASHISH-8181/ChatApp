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

// Register new user profile (name, unique username, unique phoneNumber)
usersRouter.post("/register", async (c) => {
  try {
    const body = await c.req.json<RegisterUserPayload>();
    const user = await messagesService.registerUser(body);
    return c.json({ user }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return c.json({ error: message }, 400);
  }
});

// Sign in with existing username or phone number
usersRouter.post("/login", async (c) => {
  try {
    const body = await c.req.json<LoginUserPayload>();
    const user = await messagesService.loginUser(body.identifier);
    return c.json({ user }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return c.json({ error: message }, 404);
  }
});

// Update user display name (username and phone number are strictly immutable)
usersRouter.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{ name?: string }>();
    if (!body.name) {
      return c.json({ error: "Display name is required." }, 400);
    }
    const user = await messagesService.updateUserName(id, body.name);
    return c.json({ user }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update profile";
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
