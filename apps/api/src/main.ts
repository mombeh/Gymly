import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule, ObserveInstrument } from './app.module';
import { configureApp } from './app.setup';
import type { AppConfiguration } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  const config = app.get(ConfigService).getOrThrow<AppConfiguration>('app');

  configureApp(app, config);

  await app.listen(config.port);
}

void bootstrap();
