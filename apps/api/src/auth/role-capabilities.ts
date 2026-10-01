import { UserRole } from '../generated/prisma/client';

/**
 * A unit of work the application authorises independently of the route that
 * serves it. Endpoints declare a capability, not a hand-written role list.
 */
export const RoleCapability = {
  /** Owner-only configuration and staff administration. */
  ADMINISTRATION: 'ADMINISTRATION',
  /** Creating, editing and archiving member records. */
  MEMBER_MANAGEMENT: 'MEMBER_MANAGEMENT',
  /** Enrolling members, changing plans and handling suspensions. */
  MEMBERSHIP_OPERATIONS: 'MEMBERSHIP_OPERATIONS',
  /** Taking payments and issuing receipts. */
  PAYMENT_RECORDING: 'PAYMENT_RECORDING',
  /** Check-in at the desk and class attendance. */
  ATTENDANCE_RECORDING: 'ATTENDANCE_RECORDING',
  /** Training plans and progress for members a trainer works with. */
  TRAINING_PROGRAMMES: 'TRAINING_PROGRAMMES',
  /** A member viewing and editing their own record. */
  SELF_SERVICE: 'SELF_SERVICE',
} as const;

export type RoleCapability = (typeof RoleCapability)[keyof typeof RoleCapability];

/**
 * The single place role policy is written down.
 *
 * Controllers reference a capability, so a policy change is one edit here rather
 * than an audit of every controller, and an endpoint can never quietly disagree
 * with another endpoint about who may perform the same job.
 *
 * OWNER is listed explicitly in every capability instead of being granted
 * implicitly by a "superuser bypass" branch. An implicit bypass is easy to add
 * but hard to see when reading a route; here the owner's access is stated in the
 * same place as everyone else's, and a reviewer can confirm it in one read.
 *
 * This is role-based access only. It answers "may this kind of user perform this
 * kind of work", not "may this user touch this specific record" — scoping a
 * trainer to the members assigned to them is a separate, resource-level check
 * that belongs in the owning service.
 */
export const CAPABILITY_ROLES: Readonly<Record<RoleCapability, readonly UserRole[]>> = {
  [RoleCapability.ADMINISTRATION]: [UserRole.OWNER],
  [RoleCapability.MEMBER_MANAGEMENT]: [UserRole.OWNER, UserRole.RECEPTIONIST],
  [RoleCapability.MEMBERSHIP_OPERATIONS]: [UserRole.OWNER, UserRole.RECEPTIONIST],
  [RoleCapability.PAYMENT_RECORDING]: [UserRole.OWNER, UserRole.RECEPTIONIST],
  [RoleCapability.ATTENDANCE_RECORDING]: [UserRole.OWNER, UserRole.RECEPTIONIST],
  [RoleCapability.TRAINING_PROGRAMMES]: [UserRole.OWNER, UserRole.TRAINER],
  [RoleCapability.SELF_SERVICE]: [UserRole.OWNER, UserRole.MEMBER],
};

/** Roles permitted to perform a capability. */
export function rolesFor(capability: RoleCapability): readonly UserRole[] {
  return CAPABILITY_ROLES[capability];
}

/**
 * Roles permitted to perform any one of several capabilities.
 *
 * A route that covers several front-desk jobs would otherwise repeat OWNER once
 * per job in its decorator.
 */
export function rolesForAny(...capabilities: readonly RoleCapability[]): UserRole[] {
  return [...new Set(capabilities.flatMap((capability) => CAPABILITY_ROLES[capability]))];
}

/** True when the role may perform the capability. */
export function canPerform(role: UserRole, capability: RoleCapability): boolean {
  return CAPABILITY_ROLES[capability].includes(role);
}