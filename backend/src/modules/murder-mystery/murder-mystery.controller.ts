import { Hono } from "hono";
import { murderMysteryService } from "./murder-mystery.service.js";
import type {
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

export const murderMysteryRouter = new Hono();

// Create room
murderMysteryRouter.post("/rooms", async (c) => {
  try {
    const body = await c.req.json<CreateMMRoomPayload>();
    const room = await murderMysteryService.createRoom(body);
    return c.json({ room }, 201);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to create room" }, 400);
  }
});

// Join room by code
murderMysteryRouter.post("/join", async (c) => {
  try {
    const body = await c.req.json<JoinMMRoomPayload>();
    const room = await murderMysteryService.joinRoom(body);
    return c.json({ room }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to join room" }, 400);
  }
});

// Get room state for a user
murderMysteryRouter.get("/rooms/:id", async (c) => {
  try {
    const roomId = c.req.param("id");
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ error: "userId query param is required" }, 400);
    }
    const room = await murderMysteryService.getSanitizedRoomState(roomId, userId);
    return c.json({ room }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to load room" }, 404);
  }
});

// Toggle ready
murderMysteryRouter.post("/rooms/:id/ready", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string; isReady: boolean }>();
    const room = await murderMysteryService.toggleReady({
      roomId,
      userId: body.userId,
      isReady: body.isReady,
    });
    return c.json({ room }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to toggle ready" }, 400);
  }
});

// Start game
murderMysteryRouter.post("/rooms/:id/start", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string }>();
    const room = await murderMysteryService.startGame({
      roomId,
      userId: body.userId,
    });
    return c.json({ room }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to start game" }, 400);
  }
});

// Role viewed
murderMysteryRouter.post("/rooms/:id/viewed-role", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string }>();
    await murderMysteryService.viewedRole({ roomId, userId: body.userId });
    return c.json({ status: "ok" }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to acknowledge role" }, 400);
  }
});

// Murderer action
murderMysteryRouter.post("/rooms/:id/murder", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string; targetUserId: string }>();
    await murderMysteryService.submitMurdererAction({
      roomId,
      userId: body.userId,
      targetUserId: body.targetUserId,
    });
    return c.json({ status: "ok" }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to submit murder action" }, 400);
  }
});

// Healer action
murderMysteryRouter.post("/rooms/:id/heal", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string; targetUserId: string }>();
    await murderMysteryService.submitHealerAction({
      roomId,
      userId: body.userId,
      targetUserId: body.targetUserId,
    });
    return c.json({ status: "ok" }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to submit heal action" }, 400);
  }
});

// Cast vote
murderMysteryRouter.post("/rooms/:id/vote", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string; targetUserId: string }>();
    await murderMysteryService.castVote({
      roomId,
      userId: body.userId,
      targetUserId: body.targetUserId,
    });
    return c.json({ status: "ok" }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to cast vote" }, 400);
  }
});

// Send in-game message
murderMysteryRouter.post("/rooms/:id/messages", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string; text: string }>();
    const message = await murderMysteryService.sendMessage({
      roomId,
      userId: body.userId,
      text: body.text,
    });
    return c.json({ message }, 201);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to send message" }, 400);
  }
});

// Play again
murderMysteryRouter.post("/rooms/:id/play-again", async (c) => {
  try {
    const roomId = c.req.param("id");
    const body = await c.req.json<{ userId: string }>();
    const room = await murderMysteryService.playAgain(roomId, body.userId);
    return c.json({ room }, 200);
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to reset room" }, 400);
  }
});
