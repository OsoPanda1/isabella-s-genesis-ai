import type { PrismaClient } from "@/generated/prisma";

type PrismaModelMethod = (...args: unknown[]) => Promise<unknown>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

async function getPrismaClient(): Promise<PrismaClient> {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const { PrismaClient: PrismaClientConstructor } = await import("../generated/prisma");
  const client = new PrismaClientConstructor();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get: (_target, model: string) =>
    new Proxy(
      {},
      {
        get: (_modelTarget, method: string) =>
          (async (...args: unknown[]) => {
            const client = await getPrismaClient();
            const modelClient = client[model as keyof PrismaClient] as unknown as Record<string, PrismaModelMethod>;
            return modelClient[method](...args);
          }) as PrismaModelMethod,
      },
    ),
});
