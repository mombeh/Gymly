import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AUTHENTICATION_REQUIRED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  type AuthenticatedUser,
  type AuthTokenPayload,
} from '../auth.types';
import { TokenService } from '../token.service';

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

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

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

    request.user = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    return true;
  }
}
