'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '../../lib/auth-context';
import { Header } from './header';
import { Sidebar } from './sidebar';

/**
 * The signed-in application frame: sidebar, header and the page slot.
 *
 * Only mounted inside the protected layout, so the auth context is guaranteed
 * to have a resolved status before anything is rendered.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // The sidebar renders the same links at every width, so dismissing the
  // mobile drawer must also happen when the viewport grows past the breakpoint.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 900px)');

    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };

    desktop.addEventListener('change', handleChange);

    return () => desktop.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  if (user === null) return null;

  return (
    <div className="shell">
      <a className="shell-skip-link" href="#shell-main">
        Skip to content
      </a>

      <div className="shell-sidebar-wrap" data-open={menuOpen}>
        <button
          type="button"
          className="shell-scrim"
          onClick={() => setMenuOpen(false)}
          tabIndex={menuOpen ? 0 : -1}
          aria-label="Close navigation menu"
        />
        <Sidebar role={user.role} onNavigate={() => setMenuOpen(false)} />
      </div>

      <div className="shell-body">
        <Header role={user.role} onOpenMenu={() => setMenuOpen(true)} />
        <main className="shell-main" id="shell-main">
          {children}
        </main>
      </div>
    </div>
  );
}
