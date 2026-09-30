import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import type { PrismaService } from '../prisma/prisma.service';

type HealthCheckResult = Awaited<ReturnType<HealthService['check']>>;

function createConfigService(env: 'development' | 'production'): ConfigService {
  return {
    getOrThrow: () => ({ env }),
  } as unknown as ConfigService;
}

function createPrismaService(queryRaw: () => Promise<unknown>): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

describe('HealthService', () => {
  describe('when the database is reachable', () => {
    it('reports ok with the database up', async () => {
      const service = new HealthService(
        createPrismaService(() => Promise.resolve([{ '?column?': 1 }])),
        createConfigService('development'),
      );

      const result: HealthCheckResult = await service.check();

      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.database.error).toBeUndefined();
      expect(typeof result.checks.database.latencyMs).toBe('number');
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('executes a real query rather than assuming connectivity', async () => {
      const queryRaw = jest.fn(() => Promise.resolve([{ '?column?': 1 }]));
      const service = new HealthService(
        createPrismaService(queryRaw),
        createConfigService('development'),
      );

      await service.check();

      expect(queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the database is unreachable', () => {
    it('reports degraded with the database down instead of throwing', async () => {
      const service = new HealthService(
        createPrismaService(() => Promise.reject(new Error('connection refused'))),
        createConfigService('development'),
      );

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('down');
      expect(result.checks.database.error).toContain('connection refused');
    });

    it('hides driver detail in production, where errors can echo connection info', async () => {
      const service = new HealthService(
        createPrismaService(() =>
          Promise.reject(new Error('failed to connect to postgresql://user:hunter2@host/db')),
        ),
        createConfigService('production'),
      );

      const result = await service.check();

      expect(result.checks.database.error).toBe('database unreachable');
      expect(result.checks.database.error).not.toContain('hunter2');
    });
  });
});
