import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { AppConfiguration } from '../config/configuration';

/**
 * Builds a Prisma client bound to a driver-adapter connection pool.
 * Takes the connection string explicitly so tests can point at a dedicated
 * test database without booting the Nest container.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Single shared Prisma client for the process. Each instance owns a connection
 * pool, so exactly one must be reused rather than created per request.
 *
 * The connection string comes from the validated global configuration, which is
 * why DATABASE_URL is never read from process.env here.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<AppConfiguration>('app');

    super({ adapter: new PrismaPg({ connectionString: config.database.url }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
