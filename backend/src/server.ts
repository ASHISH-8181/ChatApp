import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { serve } from "@hono/node-server";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config/index.js";
import { app } from "./app.js";
import { registerChatSocket } from "./sockets/chat.socket.js";
import type { ClientToServerEvents, ServerToClientEvents } from "@chatapp/shared";

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

// Attach Socket.IO to the HTTP server with high-concurrency tuning (1,000+ users)
const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
  server as any,
  {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    perMessageDeflate: false, // Disables compression CPU bottlenecks under heavy concurrency
    maxHttpBufferSize: 1e7,  // 10MB limit for media
    transports: ["websocket", "polling"],
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
}, 12000);

export { app, server, io };
// Server updated with friends & media features
