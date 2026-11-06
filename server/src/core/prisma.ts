import { PrismaClient } from "@prisma/client";

/** Creates a Prisma Client. Pass a URL to override DATABASE_URL (tests only). */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
}

/** The single Prisma Client of the running process (SDS 3.4). */
export const prisma = createPrismaClient();
