import { Controller, Get } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RoleCapability, rolesFor, rolesForAny } from '../auth/role-capabilities';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { UserRole } from '../generated/prisma/client';

/**
 * Scaffolding that exercises the authorization infrastructure.
 *
 * The business modules these capabilities describe (members, payments,
 * attendance, training) are deliberately not implemented yet. Each route here
 * returns the capability it stands in for, so the role policy can be reviewed
 * and tested on its own before any real data exists. When a real module lands it
 * should use the same @Auth(...rolesFor(...)) declaration and this module can be
 * deleted.
 */
@Controller('access')
export class AccessController {
  /** Any authenticated user, regardless of role. */
  @Get('profile')
  @Auth()
  profile(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }

  @Get('administration')
  @Auth(...rolesFor(RoleCapability.ADMINISTRATION))
  administration(): { capability: RoleCapability; roles: readonly UserRole[] } {
    return describe(RoleCapability.ADMINISTRATION);
  }

  @Get('front-desk')
  @Auth(
    ...rolesForAny(
      RoleCapability.MEMBER_MANAGEMENT,
      RoleCapability.PAYMENT_RECORDING,
      RoleCapability.ATTENDANCE_RECORDING,
    ),
  )
  frontDesk(): { capability: RoleCapability; roles: readonly UserRole[] } {
    return describe(RoleCapability.MEMBER_MANAGEMENT);
  }

  @Get('training')
  @Auth(...rolesFor(RoleCapability.TRAINING_PROGRAMMES))
  training(): { capability: RoleCapability; roles: readonly UserRole[] } {
    return describe(RoleCapability.TRAINING_PROGRAMMES);
  }

  @Get('self-service')
  @Auth(...rolesFor(RoleCapability.SELF_SERVICE))
  selfService(): { capability: RoleCapability; roles: readonly UserRole[] } {
    return describe(RoleCapability.SELF_SERVICE);
  }
}

function describe(capability: RoleCapability): { capability: RoleCapability; roles: readonly UserRole[] } {
  return { capability, roles: rolesFor(capability) };
}