import { applyDecorators, UseGuards } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Marks a route as requiring an authenticated caller, optionally restricted to
 * the given roles.
 *
 * Guards are listed in this order deliberately. Nest stops at the first guard
 * that denies, so an unauthenticated request is answered by JwtAuthGuard with
 * 401 and never reaches RolesGuard — which is what keeps "not signed in" and
 * "signed in but not allowed" as separate, distinguishable outcomes.
 *
 * Applying this one decorator keeps controllers free of guard plumbing and
 * stops a route from being protected by one guard but not the other.
 *
 * Prefer naming a capability:
 *   @Auth(...rolesFor(RoleCapability.PAYMENT_RECORDING))
 */
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(Roles(...roles), UseGuards(JwtAuthGuard, RolesGuard));