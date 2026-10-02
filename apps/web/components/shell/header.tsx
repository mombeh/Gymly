'use client';

import { useAuth } from '../../lib/auth-context';
import { initialsFor, roleLabel, type Role } from '../../lib/nav-items';

interface HeaderProps {
  role: Role;
  onOpenMenu: () => void;
}

/**
 * Page header and the account area.
 *
 * Reads the signed-in person from the auth context rather than taking props, so
 * the identity shown here is always the one the session actually holds. Sign
 * out lives in the sidebar footer, so it is reachable from every width.
 */
export function Header({ role, onOpenMenu }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="shell-header">
      <button
        type="button"
        className="shell-menu-button"
        onClick={onOpenMenu}
        aria-label="Open navigation menu"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>

      <div className="shell-account">
        <span className="shell-avatar" aria-hidden="true">
          {user === null ? '' : initialsFor(user)}
        </span>

        <span className="shell-account-text">
          <span className="shell-account-name">
            {user === null ? '' : `${user.firstName} ${user.lastName}`}
          </span>
          <span className="shell-account-role">{roleLabel(role)}</span>
        </span>
      </div>
    </header>
  );
}
