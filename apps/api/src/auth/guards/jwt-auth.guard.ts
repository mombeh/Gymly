import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AUTHENTICATION_REQUIRED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  inactiveAccountMessage,
  type AuthenticatedUser,
  type AuthTokenPayload,
} from '../auth.types';
import { TokenService } from '../token.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.trim() === '') {
    return null;
  }

  return token.trim();
}

/**
 * Establishes who the caller is, and only then whether they may proceed.
 *
 * The token is proved first: a bad signature, a bad algorithm, a bad scheme or
 * an expired token are all 401 and are deliberately indistinguishable, so a
 * caller cannot probe why a token was rejected.
 *
 * The row is then re-read rather than served from the token's claims. A token
 * lives for JWT_EXPIRES_IN, so trusting its `role` would let a demotion, a
 * suspension or a deletion sit unenforced until the token happened to expire —
 * and a TRAINER who had just been demoted would keep creating and deactivating
 * members. Reading the row closes that window: a privilege change takes effect
 * on the next request instead of up to a quarter of an hour later. The claims
 * stay on the token as a convenience for the client; they are not the authority.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (token === null) {
      throw new UnauthorizedException(AUTHENTICATION_REQUIRED_MESSAGE);
    }

    let payload: AuthTokenPayload;

    try {
      payload = await this.tokenService.verify(token);
    } catch {
      // Expired, tampered, wrong signature or wrong algorithm all collapse into
      // one response, so a caller cannot probe why a token was rejected.
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (user === null) {
      this.logger.warn(`Token referenced user ${payload.sub}, which no longer exists.`);

      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status !== 'ACTIVE') {
      this.logger.warn(`Rejected request from ${user.email}: account is ${user.status}.`);

      throw new ForbiddenException(inactiveAccountMessage(user.status));
    }

    request.user = {
      sub: user.id,
      email: user.email,
      // From the row, not from the payload, so RolesGuard decides on the
      // caller's current role rather than the one they held when they signed in.
      role: user.role,
    };

    return true;
  }
}
