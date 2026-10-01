import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AUTHENTICATION_REQUIRED_MESSAGE } from '../auth.types';
import type { UserRole } from '../../generated/prisma/client';
import type { AuthenticatedRequest } from './jwt-auth.guard';

export const INSUFFICIENT_ROLE_MESSAGE = 'You do not have permission to perform this action';

/**
 * Enforces role-based access.
 *
 * Deliberately separate from JwtAuthGuard: authentication answers "who is this"
 * and authorization answers "may they do this", so the two failure modes stay
 * distinguishable. A request with no valid identity is rejected with 401 by
 * JwtAuthGuard; a valid identity lacking the role is rejected here with 403.
 * Conflating them would tell an unauthenticated caller that credentials were
 * the problem when they were merely insufficient.
 *
 * Reads role requirements from @Roles metadata, so no controller needs to
 * contain role-checking logic.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No requirement declared: any authenticated caller is welcome. The guard
    // still refuses to run without an identity, so it cannot be used to make a
    // route public by accident.
    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return this.hasIdentity(context);
    }

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;

    if (user === undefined) {
      throw new UnauthorizedException(AUTHENTICATION_REQUIRED_MESSAGE);
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(INSUFFICIENT_ROLE_MESSAGE);
    }

    return true;
  }

  private hasIdentity(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;

    if (user === undefined) {
      throw new UnauthorizedException(AUTHENTICATION_REQUIRED_MESSAGE);
    }

    return true;
  }
}