import request from 'supertest';
import type { App } from 'supertest/types';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/test-app';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health reports the API and database are up', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' } },
    });
    expect(typeof response.body.uptimeSeconds).toBe('number');
    expect(typeof response.body.timestamp).toBe('string');
    expect(typeof response.body.checks.database.latencyMs).toBe('number');
  });

  it('answers with CORS headers for a configured frontend origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:8000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      process.env.FRONTEND_URL ?? 'http://localhost:8000',
    );
  });

  it('does not advertise an allow-origin header for an unconfigured origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://untrusted.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('is not reachable without the global prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
