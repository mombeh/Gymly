import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/configuration';
// Value import, not `import type`: emitDecoratorMetadata needs the class in
// scope at runtime to resolve the constructor parameter type for DI.
import { PrismaService } from '../prisma/prisma.service';

export type HealthStatus = 'ok' | 'degraded';

export interface DatabaseHealth {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: DatabaseHealth;
  };
}

function elapsedMs(startedAt: bigint): number {
  return Math.round((Number(process.hrtime.bigint() - startedAt) / 1e6) * 100) / 100;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get isProduction(): boolean {
    return this.configService.getOrThrow<AppConfiguration>('app').env === 'production';
  }

  /**
   * Reports service liveness plus whether the database is actually reachable.
   * A failure is returned as a degraded report rather than thrown, so the
   * endpoint answers 503 instead of falling through to the exception filter.
   */
  async check(): Promise<HealthReport> {
    const startedAt = process.hrtime.bigint();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime() * 100) / 100,
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: 'up',
            latencyMs: elapsedMs(startedAt),
          },
        },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      this.logger.error(`Database health check failed: ${detail}`);

      return {
        status: 'degraded',
        uptimeSeconds: Math.round(process.uptime() * 100) / 100,
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: 'down',
            latencyMs: elapsedMs(startedAt),
            // Driver errors can echo connection details, so production gets a
            // generic reason and the real cause stays in the logs.
            error: this.isProduction ? 'database unreachable' : detail,
          },
        },
      };
    }
  }
}
