import { Hono } from "hono";
import { AccessToken } from "livekit-server-sdk";

export const livekitRouter = new Hono();

livekitRouter.get("/token", async (c) => {
  const room = c.req.query("room");
  const username = c.req.query("username") || "player";
  const userId = c.req.query("userId") || `user_${Date.now()}`;

  if (!room) {
    return c.json({ error: "Missing room parameter" }, 400);
  }

  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";
  const livekitUrl = process.env.LIVEKIT_URL || "wss://your-project.livekit.cloud";

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: username,
      ttl: "24h",
    });

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return c.json({
      token,
      url: livekitUrl,
      room,
      identity: userId,
    });
  } catch (error: any) {
    console.error("[LiveKit Token Error]:", error);
    return c.json({ error: error.message || "Failed to generate token" }, 500);
  }
});
