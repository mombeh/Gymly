import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfiguration } from '../config/configuration';
import type { AuthTokenPayload } from './auth.types';
import type { UserRole } from '../generated/prisma/client';

/** Identity fields the token is minted from. */
interface UserForToken {
  id: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class TokenService {
  private readonly config: AppConfiguration;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AppConfiguration>('app');
  }

  async issue(user: UserForToken): Promise<string> {
    const payload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.signAsync(payload);
  }

  /**
   * Verifies signature, expiry and algorithm.
   *
   * The algorithm is pinned to HS256 on both sign and verify, which blocks
   * algorithm-confusion attacks where a caller presents `alg: none` or asks the
   * server to treat an asymmetric key as an HMAC secret.
   */
  async verify(token: string): Promise<AuthTokenPayload> {
    return this.jwtService.verifyAsync<AuthTokenPayload>(token);
  }

  /** Access token lifetime in seconds, resolved from JWT_EXPIRES_IN. */
  get expiresInSeconds(): number {
    const configured = this.config.auth.jwtExpiresIn;
    const withUnit = /^(\d+)([smhd])?$/.exec(configured.trim());

    if (withUnit === null) {
      return Number(configured);
    }

    const amount = Number(withUnit[1]);
    const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

    return amount * (unitSeconds[withUnit[2] ?? 's'] ?? 1);
  }
}
