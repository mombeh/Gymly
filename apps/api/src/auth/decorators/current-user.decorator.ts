import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth.types';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';

/**
 * Injects the identity that JwtAuthGuard attached to the request.
 * Only meaningful on routes that use the guard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user === undefined) {
      throw new Error(
        'CurrentUser was used on a route without JwtAuthGuard, so no user is attached to the request.',
      );
    }

    return request.user;
  },
);
