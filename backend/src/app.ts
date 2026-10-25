import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config/index.js";
import { messagesRouter, usersRouter, groupsRouter, friendsRouter } from "./modules/messages/messages.controller.js";
import { murderMysteryRouter } from "./modules/murder-mystery/murder-mystery.controller.js";
import { livekitRouter } from "./modules/livekit/livekit.controller.js";
import { uploadRouter } from "./modules/upload/upload.controller.js";

const app = new Hono();

// Enable CORS for mobile clients, web clients, and local development
app.use(
  "*",
  cors({
    origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(","),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

// Root informational endpoint
app.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "chatapp-backend",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      messages: "/api/messages",
      users: "/api/users",
      groups: "/api/groups",
      friends: "/api/friends",
      livekit: "/api/livekit",
      upload: "/api/upload",
      murderMystery: "/api/murder-mystery",
    },
    note: "Socket.IO real-time features require a persistent WebSocket server (e.g. Render / Railway / Fly.io).",
  });
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "chatapp-backend",
    timestamp: new Date().toISOString(),
  });
});

// Informational response for Socket.IO clients connecting to serverless endpoint
app.all("/socket.io/*", (c) => {
  return c.json(
    {
      error: "Socket.IO requires a persistent server. Point your WebSocket client to your dedicated Socket.IO instance.",
    },
    426
  );
});

// API Routes
app.route("/api/messages", messagesRouter);
app.route("/api/users", usersRouter);
app.route("/api/groups", groupsRouter);
app.route("/api/friends", friendsRouter);
app.route("/api/murder-mystery", murderMysteryRouter);
app.route("/api/livekit", livekitRouter);
app.route("/api/upload", uploadRouter);

// 404 handler
app.notFound((c) => c.json({ error: "Route not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: err.message || "Internal server error" }, 500);
});

export { app };
