import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client';

/**
 * Metadata key under which RolesGuard reads the required roles.
 *
 * Namespaced so it cannot collide with another feature's metadata key.
 */
export const ROLES_KEY = 'gymly:roles';

/**
 * Declares which roles may reach a route.
 *
 * Prefer naming a capability (`@Auth(...rolesFor(Capability.PAYMENT_RECORDING))`)
 * over listing roles directly, so the policy lives in role-capabilities.ts.
 * An empty list means "any authenticated user".
 */
export const Roles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);