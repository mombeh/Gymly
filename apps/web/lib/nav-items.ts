import type { PublicUser } from './api-types';

export type Role = PublicUser['role'];

/**
 * Capability names mirror the API's `RoleCapability` enum one for one.
 *
 * This is presentation only. It decides which links a person is *offered*; the
 * API's RolesGuard decides what they are actually *allowed* to do, and nothing
 * here is a security boundary. The backend is the single source of truth — if
 * the two ever disagree, the backend wins and this list is simply wrong.
 */
export const Capability = {
  ADMINISTRATION: 'ADMINISTRATION',
  MEMBER_MANAGEMENT: 'MEMBER_MANAGEMENT',
  MEMBERSHIP_OPERATIONS: 'MEMBERSHIP_OPERATIONS',
  PAYMENT_RECORDING: 'PAYMENT_RECORDING',
  ATTENDANCE_RECORDING: 'ATTENDANCE_RECORDING',
  TRAINING_PROGRAMMES: 'TRAINING_PROGRAMMES',
  SELF_SERVICE: 'SELF_SERVICE',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

/** Mirrors the API's CAPABILITY_ROLES map. Keep the two in step. */
const CAPABILITY_ROLES: Readonly<Record<Capability, readonly Role[]>> = {
  [Capability.ADMINISTRATION]: ['OWNER'],
  [Capability.MEMBER_MANAGEMENT]: ['OWNER', 'RECEPTIONIST'],
  [Capability.MEMBERSHIP_OPERATIONS]: ['OWNER', 'RECEPTIONIST'],
  [Capability.PAYMENT_RECORDING]: ['OWNER', 'RECEPTIONIST'],
  [Capability.ATTENDANCE_RECORDING]: ['OWNER', 'RECEPTIONIST'],
  [Capability.TRAINING_PROGRAMMES]: ['OWNER', 'TRAINER'],
  [Capability.SELF_SERVICE]: ['OWNER', 'MEMBER'],
};

export interface NavItem {
  key: string;
  label: string;
  href: string;
  /**
   * Capabilities that grant access to this section. An empty list means every
   * authenticated role may see it.
   */
  capabilities: readonly Capability[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', capabilities: [] },
  { key: 'members', label: 'Members', href: '/members', capabilities: [Capability.MEMBER_MANAGEMENT] },
  {
    key: 'memberships',
    label: 'Memberships',
    href: '/memberships',
    capabilities: [Capability.MEMBERSHIP_OPERATIONS],
  },
  {
    key: 'payments',
    label: 'Payments',
    href: '/payments',
    capabilities: [Capability.PAYMENT_RECORDING],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    href: '/attendance',
    capabilities: [Capability.ATTENDANCE_RECORDING],
  },
  // Managing the trainer roster is administrative; a trainer's own tools are
  // under Workouts and Progress.
  { key: 'trainers', label: 'Trainers', href: '/trainers', capabilities: [Capability.ADMINISTRATION] },
  {
    key: 'workouts',
    label: 'Workouts',
    href: '/workouts',
    capabilities: [Capability.TRAINING_PROGRAMMES],
  },
  {
    key: 'progress',
    label: 'Progress',
    href: '/progress',
    capabilities: [Capability.TRAINING_PROGRAMMES],
  },
  { key: 'expenses', label: 'Expenses', href: '/expenses', capabilities: [Capability.ADMINISTRATION] },
  { key: 'reports', label: 'Reports', href: '/reports', capabilities: [Capability.ADMINISTRATION] },
];

/** True when the role holds any of the capabilities the section requires. */
export function canSeeNavItem(role: Role, item: NavItem): boolean {
  if (item.capabilities.length === 0) return true;

  return item.capabilities.some((capability) => CAPABILITY_ROLES[capability].includes(role));
}

/** The sections this role should be offered, in navigation order. */
export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => canSeeNavItem(role, item));
}

/** Human-readable role for the account area. */
export function roleLabel(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

/** Up to two initials for the account avatar. */
export function initialsFor(user: Pick<PublicUser, 'firstName' | 'lastName'>): string {
  const first = user.firstName.trim().charAt(0);
  const last = user.lastName.trim().charAt(0);

  return `${first}${last}`.toUpperCase() || '?';
}
