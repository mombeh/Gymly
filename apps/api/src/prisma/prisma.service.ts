import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export const DATABASE_URL_MISSING_MESSAGE =
  'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and set it.';

export function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString.trim() === '') {
    throw new Error(DATABASE_URL_MISSING_MESSAGE);
  }

  return connectionString;
}

/**
 * Builds a Prisma client bound to a driver-adapter connection pool.
 * Exported separately from the Nest provider so tests can create an isolated
 * client without bootstrapping the application container.
 */
export function createPrismaClient(connectionString: string = requireDatabaseUrl()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Single shared Prisma client for the process. Each instance owns a connection
 * pool, so exactly one must be reused rather than created per request.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
