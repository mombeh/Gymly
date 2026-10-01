import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
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
            expiresIn: config.auth.jwtExpiresIn,
          },
          // Pinning the accepted algorithm on verify blocks algorithm confusion.
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, JwtAuthGuard],
  // Exported for future resource modules that need to identify the caller.
  exports: [TokenService, JwtAuthGuard],
})
export class AuthModule {}
