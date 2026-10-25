import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
  const baseClient = new PrismaClient({
    datasources: process.env.DATABASE_URL
      ? { db: { url: process.env.DATABASE_URL } }
      : undefined,
    log: ["error"],
  });

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          let attempts = 0;
          while (attempts < 3) {
            try {
              return await query(args);
            } catch (error: any) {
              attempts++;
              const isConnError =
                error?.code === "P1001" ||
                error?.code === "P1002" ||
                error?.code === "P1008" ||
                error?.code === "P1017" ||
                error?.message?.includes("Can't reach database server") ||
                error?.message?.includes("Connection closed") ||
                error?.message?.includes("Connection reset");

              if (isConnError && attempts < 3) {
                console.warn(
                  `[Prisma] Retrying ${model}.${operation} (attempt ${attempts}/3) after Neon cold-start/reconnect...`
                );
                await new Promise((r) => setTimeout(r, 1500));
                continue;
              }
              throw error;
            }
          }
        },
      },
    },
  });
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
