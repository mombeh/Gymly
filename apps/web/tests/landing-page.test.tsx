import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import LandingPage from '../app/page';
import { ContinueIfAuthenticated } from '../components/landing/continue-if-authenticated';
import { AuthProvider } from '../lib/auth-context';
import { installFetchMock, stubApi } from './test-utils';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/',
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const ME_URL = 'http://localhost:3000/api/auth/me';

const USER = {
  id: 'user-1',
  email: 'owner@gymly.test',
  firstName: 'Ada',
  lastName: 'Otieno',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
};

let fetchMock: Mock;

beforeEach(() => {
  // Installed per test because afterEach removes the global stub.
  fetchMock = installFetchMock().fetchMock;
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.pathname = '/';
  nav.search = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('landing page', () => {
  // app/layout.tsx supplies AuthProvider in the real app, so the tests mirror that.
  function renderLanding() {
    return render(
      <AuthProvider>
        <LandingPage />
      </AuthProvider>,
    );
  }

  it('presents the product and its features', () => {
    renderLanding();

    const heading = screen.getByRole('heading', { level: 1 });
    // The line break is a <br>, so textContent carries no space between halves.
    expect(heading.textContent).toContain('Run your gym.');
    expect(heading.textContent).toContain('spreadsheets');
    expect(screen.getByText('Member management')).toBeTruthy();
    expect(screen.getByText('Payment recording')).toBeTruthy();
    expect(screen.getByText('Attendance')).toBeTruthy();
    expect(screen.getByText('Role-based access')).toBeTruthy();
  });

  it('offers both routes into the app', () => {
    renderLanding();

    expect(screen.getAllByRole('link', { name: 'Create account' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Sign in/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Get started free' }).getAttribute('href')).toBe('/register');
  });

  it('does not call the API, because it is public', () => {
    renderLanding();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ContinueIfAuthenticated', () => {
  it('leaves an anonymous visitor on the landing page', () => {
    render(
      <AuthProvider>
        <ContinueIfAuthenticated />
      </AuthProvider>,
    );

    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('sends an already-signed-in visitor to the dashboard', async () => {
    window.localStorage.setItem('gymly.auth.token', 'stored-token');
    stubApi(fetchMock, {
      [ME_URL]: async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ user: USER }),
        }) as unknown as Response,
    });

    render(
      <AuthProvider>
        <ContinueIfAuthenticated />
      </AuthProvider>,
    );

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Taking you to your dashboard…',
    );
  });
});