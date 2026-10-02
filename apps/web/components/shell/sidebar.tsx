'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LogoMark } from '../landing/illustrations';
import { visibleNavItems, type Role } from '../../lib/nav-items';

interface SidebarProps {
  role: Role;
  /** Close handler, so tapping a link or the scrim dismisses the mobile drawer. */
  onNavigate?: () => void;
}

export function Sidebar({ role, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const items = visibleNavItems(role);

  return (
    <nav className="shell-sidebar" aria-label="Main">
      <Link className="shell-brand" href="/dashboard" onClick={onNavigate}>
        <LogoMark size={28} />
        <span>Gymly</span>
      </Link>

      <ul className="shell-nav">
        {items.map((item) => {
          // Exact match for the dashboard, prefix match elsewhere so a section
          // stays highlighted while browsing its own sub-pages.
          const active =
            item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.key}>
              <Link
                className="shell-nav-link"
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
