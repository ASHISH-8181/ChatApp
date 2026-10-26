import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { PrismaClient } from "@prisma/client";

function isConnectionError(error: any): boolean {
  return (
    error?.code === "P1001" ||
    error?.code === "P1002" ||
    error?.code === "P1008" ||
    error?.code === "P1017" ||
    error?.code === "P2024" ||
    error?.message?.includes("Can't reach database server") ||
    error?.message?.includes("Connection closed") ||
    error?.message?.includes("Connection reset") ||
    error?.message?.includes("Timed out fetching a new connection") ||
    error?.message?.includes("Server has closed the connection")
  );
}

const MAX_ATTEMPTS = 5;
let lastRetryLogAt = 0;

function createPrismaClient() {
  const baseClient = new PrismaClient({
    datasources: process.env.DATABASE_URL
      ? { db: { url: process.env.DATABASE_URL } }
      : undefined,
    // Connection errors are retried below; only log them once they finally fail.
    log: [],
  });

  const extended = baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          let attempt = 0;
          for (;;) {
            try {
              return await query(args);
            } catch (error: any) {
              attempt++;
              if (isConnectionError(error) && attempt < MAX_ATTEMPTS) {
                // Exponential backoff: 500ms, 1s, 2s, 4s
                const delay = 500 * 2 ** (attempt - 1);
                const now = Date.now();
                if (now - lastRetryLogAt > 10_000) {
                  lastRetryLogAt = now;
                  console.warn(
                    `[Prisma] DB unreachable on ${model}.${operation}, retrying (attempt ${attempt}/${MAX_ATTEMPTS - 1}) in ${delay}ms...`
                  );
                }
                await new Promise((r) => setTimeout(r, delay));
                continue;
              }
              if (isConnectionError(error)) {
                console.error(`[Prisma] ${model}.${operation} failed after ${attempt} attempts: database unreachable`);
              } else {
                console.error(`[Prisma] ${model}.${operation} error:`, error?.message);
              }
              throw error;
            }
          }
        },
      },
    },
  });

  // Warm up the connection eagerly and keep it alive so Neon compute does not
  // auto-suspend between requests (Neon suspends after ~5 min idle).
  const ping = () => baseClient.$queryRaw`SELECT 1`.catch(() => undefined);
  void ping();
  const keepAlive = setInterval(ping, 4 * 60 * 1000);
  keepAlive.unref?.();

  return extended;
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ExtendedPrismaClient | undefined;
}

export const prisma = (global.__prisma ?? createPrismaClient()) as ExtendedPrismaClient;

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
