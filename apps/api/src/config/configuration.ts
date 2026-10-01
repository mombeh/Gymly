import { registerAs } from '@nestjs/config';
import { validateEnv, type NodeEnvironment } from './env.validation';

export interface CorsConfiguration {
  origins: string[];
  credentials: boolean;
}

export interface AuthConfiguration {
  jwtSecret: string;
  jwtExpiresIn: string;
}

export interface AppConfiguration {
  env: NodeEnvironment;
  port: number;
  apiPrefix: string;
  cors: CorsConfiguration;
  database: {
    url: string;
  };
  auth: AuthConfiguration;
}

/**
 * Namespaced configuration for the whole application, registered under the
 * "app" key. Reads the validated environment so that every consumer (Prisma,
 * CORS, bootstrap) works from the same parsed values instead of each reading
 * process.env on its own.
 *
 * registerAs is required here: a bare function passed to ConfigModule's `load`
 * would be namespaced under its own function name instead of "app".
 */
export const appConfig = registerAs(
  'app',
  (): AppConfiguration => {
    const env = validateEnv(process.env);

    return {
      env: env.NODE_ENV,
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      cors: {
        origins: env.FRONTEND_URL,
        credentials: env.CORS_CREDENTIALS,
      },
      database: {
        url: env.DATABASE_URL,
      },
      auth: {
        jwtSecret: env.JWT_SECRET,
        jwtExpiresIn: env.JWT_EXPIRES_IN,
      },
    };
  },
);
