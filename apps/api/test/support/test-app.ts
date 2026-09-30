import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import type { AppConfiguration } from '../../src/config/configuration';

/**
 * Boots the real AppModule and applies the same configureApp() that main.ts
 * uses, so integration tests exercise the production prefix, CORS, validation
 * pipe and exception filter rather than a reduced setup.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(ConfigService).getOrThrow<AppConfiguration>('app');

  configureApp(app, config);

  await app.init();

  return app;
}
