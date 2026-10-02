import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AppShell } from '../components/shell/app-shell';
import { ProtectedRoute } from '../components/protected-route';
import { AuthProvider } from '../lib/auth-context';
import { writeToken } from '../lib/auth-storage';
import { visibleNavItems, type Role } from '../lib/nav-items';
import { installFetchMock, jsonResponse, stubApi } from './test-utils';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/dashboard',
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const ME_URL = 'http://localhost:3000/api/auth/me';
const TOKEN = 'valid.jwt.token';

let fetchMock: Mock;

function userForRole(role: Role) {
  return {
    id: 'user-1',
    email: `${role.toLowerCase()}@gymly.test`,
    firstName: 'Ada',
    lastName: 'Otieno',
    role,
    status: 'ACTIVE' as const,
  };
}

/** Seeds a token and answers /auth/me with the given role. */
function signInAs(role: Role, overrides: Record<string, unknown> = {}) {
  writeToken(TOKEN);
  stubApi(fetchMock, {
    [ME_URL]: async () => jsonResponse(200, { user: { ...userForRole(role), ...overrides } }),
  });
}

/** Mirrors the production layout: the guard wraps the shell. */
function renderShell(children: ReactNode = <p>Page body</p>) {
  return render(
    <AuthProvider>
      <ProtectedRoute>
        <AppShell>{children}</AppShell>
      </ProtectedRoute>
    </AuthProvider>,
  );
}

/** Renders the shell for a role and waits until the navigation has appeared. */
async function renderAs(role: Role) {
  signInAs(role);
  const result = renderShell();
  await screen.findByRole('navigation', { name: 'Main' });
  return result;
}

/** The section links only: excludes the skip link, the wordmark and Sign out. */
function navLabels(): string[] {
  return within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '')
    .filter((label) => label !== 'Gymly');
}

beforeEach(() => {
  // Installed per test because afterEach removes the global stub.
  fetchMock = installFetchMock().fetchMock;
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.pathname = '/dashboard';
  nav.search = '';

  // jsdom has no matchMedia; the shell uses it to collapse the drawer on resize.
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the shell for an authenticated user', () => {
  it('shows the sidebar, the header and the page slot', async () => {
    await renderAs('OWNER');

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByText('Page body')).toBeTruthy();
  });

  it('shows the signed-in person and their role in the account area', async () => {
    await renderAs('OWNER');

    expect(screen.getByText('Ada Otieno')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    // The email is not on screen: the header stays compact.
    expect(screen.queryByText('owner@gymly.test')).toBeNull();
  });

  it('takes the identity from the session rather than hardcoding it', async () => {
    signInAs('OWNER', { firstName: 'Grace', lastName: 'Hopper' });
    renderShell();

    expect(await screen.findByText('Grace Hopper')).toBeTruthy();
  });

  it('provides a skip link for keyboard users', async () => {
    await renderAs('OWNER');

    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy();
  });

  it('marks the current page in the navigation', async () => {
    nav.pathname = '/members';
    await renderAs('OWNER');

    expect(screen.getByRole('link', { name: 'Members' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
  });

  it('renders every section link as a real path', async () => {
    await renderAs('OWNER');

    for (const item of visibleNavItems('OWNER')) {
      expect(screen.getByRole('link', { name: item.label }).getAttribute('href')).toBe(item.href);
    }
  });
});

describe('the shell for an unauthenticated visitor', () => {
  it('shows no shell at all and sends them to login', async () => {
    renderShell();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fdashboard'));

    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByText('Page body')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('never briefly renders the protected content on the way out', async () => {
    render(
      <AuthProvider>
        <ProtectedRoute>
          <p>Secret</p>
        </ProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(screen.queryByText('Secret')).toBeNull();
  });
});

describe('logout', () => {
  it('clears the session and returns to login', async () => {
    await renderAs('OWNER');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));

    // The shell disappears with the session.
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(window.localStorage.getItem('gymly.auth.token')).toBeNull();
  });
});

describe('role-aware navigation', () => {
  it('gives the owner the full administrative navigation', async () => {
    await renderAs('OWNER');

    expect(navLabels()).toEqual([
      'Dashboard',
      'Members',
      'Memberships',
      'Payments',
      'Attendance',
      'Trainers',
      'Workouts',
      'Progress',
      'Expenses',
      'Reports',
    ]);
  });

  it('gives reception staff the front-desk sections only', async () => {
    await renderAs('RECEPTIONIST');

    expect(navLabels()).toEqual(['Dashboard', 'Members', 'Memberships', 'Payments', 'Attendance']);
  });

  it('gives trainers the training sections only', async () => {
    await renderAs('TRAINER');

    expect(navLabels()).toEqual(['Dashboard', 'Workouts', 'Progress']);
  });

  it('keeps member navigation minimal, since self-service is not in V1', async () => {
    await renderAs('MEMBER');

    expect(navLabels()).toEqual(['Dashboard']);
  });

  it('never offers a section the role does not hold', async () => {
    await renderAs('RECEPTIONIST');

    for (const hidden of ['Expenses', 'Reports', 'Trainers', 'Workouts', 'Progress']) {
      expect(screen.queryByRole('link', { name: hidden })).toBeNull();
    }
  });

  it('agrees with the shared nav model', async () => {
    expect(visibleNavItems('OWNER')).toHaveLength(10);
    expect(visibleNavItems('RECEPTIONIST').map((item) => item.label)).toEqual([
      'Dashboard',
      'Members',
      'Memberships',
      'Payments',
      'Attendance',
    ]);
    expect(visibleNavItems('TRAINER').map((item) => item.label)).toEqual([
      'Dashboard',
      'Workouts',
      'Progress',
    ]);
    expect(visibleNavItems('MEMBER').map((item) => item.label)).toEqual(['Dashboard']);
  });
});

describe('responsive behaviour', () => {
  it('opens and closes the navigation drawer from the header', async () => {
    await renderAs('OWNER');

    const user = userEvent.setup();
    const drawer = document.querySelector('.shell-sidebar-wrap');

    expect(drawer?.getAttribute('data-open')).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(drawer?.getAttribute('data-open')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Close navigation menu' }));
    expect(drawer?.getAttribute('data-open')).toBe('false');
  });

  it('closes the drawer on Escape', async () => {
    await renderAs('OWNER');

    const user = userEvent.setup();
    const drawer = document.querySelector('.shell-sidebar-wrap');

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(drawer?.getAttribute('data-open')).toBe('true');

    await user.keyboard('{Escape}');
    expect(drawer?.getAttribute('data-open')).toBe('false');
  });

  it('closes the drawer after navigating, so a tap cannot leave it stuck open', async () => {
    await renderAs('OWNER');

    const user = userEvent.setup();
    const drawer = document.querySelector('.shell-sidebar-wrap');

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await user.click(screen.getByRole('link', { name: 'Members' }));

    expect(drawer?.getAttribute('data-open')).toBe('false');
  });

  it('keeps the drawer scrim out of the tab order while the drawer is closed', async () => {
    await renderAs('OWNER');

    expect(
      screen.getByRole('button', { name: 'Close navigation menu' }).getAttribute('tabindex'),
    ).toBe('-1');
  });
});
