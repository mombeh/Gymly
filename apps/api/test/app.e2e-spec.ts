import request from 'supertest';
import type { App } from 'supertest/types';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/test-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  // Sits behind the global API prefix, so this is served at GET /api.
  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('returns the shared error shape for an unknown route under the prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/api/does-not-exist',
    });
    expect(typeof response.body.timestamp).toBe('string');
  });

  afterEach(async () => {
    await app.close();
  });
});
