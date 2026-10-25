import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config/index.js";
import { messagesRouter, usersRouter, groupsRouter } from "./modules/messages/messages.controller.js";
import { murderMysteryRouter } from "./modules/murder-mystery/murder-mystery.controller.js";
import { livekitRouter } from "./modules/livekit/livekit.controller.js";
import { registerChatSocket } from "./sockets/chat.socket.js";
import type { ClientToServerEvents, ServerToClientEvents } from "@chatapp/shared";

const app = new Hono();

// Enable CORS for mobile clients, web clients, and local development
app.use(
  "*",
  cors({
    origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(","),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "chatapp-backend",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.route("/api/messages", messagesRouter);
app.route("/api/users", usersRouter);
app.route("/api/groups", groupsRouter);
app.route("/api/murder-mystery", murderMysteryRouter);
app.route("/api/livekit", livekitRouter);

// 404 handler
app.notFound((c) => c.json({ error: "Route not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: err.message || "Internal server error" }, 500);
});

// Start HTTP server
const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`ChatApp backend listening on http://0.0.0.0:${info.port}`);
  }
);

// Attach Socket.IO to the HTTP server
const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
  server as any,
  {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  }
);

import { messagesService } from "./modules/messages/messages.service.js";
import { murderMysteryService } from "./modules/murder-mystery/murder-mystery.service.js";

registerChatSocket(io);

// Periodic background check for Chugli group warnings, auto-expiry, and Murder Mystery phase transitions
let isPeriodicChecking = false;
setInterval(async () => {
  if (isPeriodicChecking) return;
  isPeriodicChecking = true;
  try {
    await messagesService.checkChugliStatus(io);
    await murderMysteryService.checkPhaseTransitions(io);
  } catch (err: any) {
    if (!err?.message?.includes("Can't reach database server")) {
      console.error("[Background Check Error]:", err?.message);
    }
  } finally {
    isPeriodicChecking = false;
  }
}, 5000);

export { app, server, io };
