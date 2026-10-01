import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { AppConfiguration } from '../config/configuration';

@Module({
  imports: [
    // Registered from validated configuration so the signing key is never
    // hardcoded and never read from process.env directly.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<AppConfiguration>('app');

        return {
          secret: config.auth.jwtSecret,
          signOptions: {
            algorithm: 'HS256',
            // JWT_EXPIRES_IN is validated as \d+[smhd]? by the env validator.
            // jsonwebtoken types this as the `ms` package's StringValue
            // template literal, which a plain string cannot satisfy.
            expiresIn: config.auth.jwtExpiresIn as JwtSignOptions['expiresIn'],
          },
          // Pinning the accepted algorithm on verify blocks algorithm confusion.
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, JwtAuthGuard, RolesGuard],
  // Exported for future resource modules that need to identify the caller.
  // RolesGuard is exported so resource modules can compose guards explicitly if
  // a route needs authentication without a role restriction.
  exports: [TokenService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
