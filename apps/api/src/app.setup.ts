import {
  ValidationPipe,
  type INestApplication,
  type ValidationPipeOptions,
} from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfiguration } from './config/configuration';

export const API_PREFIX_EXCLUSIONS: readonly string[] = [];

/**
 * Exported so tests can exercise the exact same validation behaviour the
 * running application uses, instead of re-declaring the options.
 */
export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    // Implicit conversion is deliberately off. With it enabled, class-transformer
    // coerces unexpected input to strings, so a body like { password: {...} }
    // would satisfy @IsString() and reach the handler instead of being rejected.
    // DTOs that need coercion should declare it with an explicit @Type().
    enableImplicitConversion: false,
  },
};

/**
 * Single source of truth for application-level wiring.
 *
 * main.ts and the e2e suite both call this, so integration tests exercise the
 * same prefix, CORS, validation and error handling that production gets.
 */
export function configureApp(app: INestApplication, config: AppConfiguration): INestApplication {
  app.setGlobalPrefix(config.apiPrefix, {
    exclude: [...API_PREFIX_EXCLUSIONS],
  });

  app.enableCors({
    origin: config.cors.origins,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
    maxAge: 3600,
  });

  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  return app;
}
