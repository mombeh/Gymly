import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { LoginForm } from '../components/login-form';
import { ProtectedRoute } from '../components/protected-route';
import { readToken, writeToken } from '../lib/auth-storage';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { installFetchMock, jsonResponse, stubApi as stubRoutes, type RecordedCall } from './test-utils';

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

const USER = {
  id: 'user-1',
  email: 'owner@gymly.test',
  firstName: 'Ada',
  lastName: 'Lopez',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
};

const TOKEN = 'jwt-access-token';

let fetchMock: Mock;
let recordedCall: (index?: number) => RecordedCall;

function stubApi(routes: Record<string, () => Promise<Response>>) {
  stubRoutes(fetchMock, routes);
}

function renderWithAuth(ui: ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

function callsTo(path: string) {
  return fetchMock.mock.calls.filter((call) => String(call?.[0]).endsWith(path));
}

// Installed per test because afterEach removes the global stub.
beforeEach(() => {
  const handle = installFetchMock();
  fetchMock = handle.fetchMock;
  recordedCall = handle.recordedCall;

  nav.replace.mockReset();
  nav.push.mockReset();
  nav.pathname = '/dashboard';
  nav.search = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login', () => {
  const LOGIN_URL = 'http://localhost:3000/api/auth/login';

  it('signs the user in, stores the token and redirects to the app', async () => {
    stubApi({
      [LOGIN_URL]: async () => jsonResponse(200, { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 900, user: USER }),
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'owner@gymly.test');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard'));

    expect(recordedCall().json()).toEqual({
      email: 'owner@gymly.test',
      password: 'correct-horse',
    });
    expect(readToken()).toBe(TOKEN);
  });

  it('trims surrounding whitespace before sending the email', async () => {
    stubApi({
      [LOGIN_URL]: async () => jsonResponse(200, { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 900, user: USER }),
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), '  owner@gymly.test  ');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect((recordedCall().json() as { email: string }).email).toBe('owner@gymly.test');
  });

  it('returns to the originally requested page when next is set', async () => {
    nav.pathname = '/login';
    nav.search = 'next=%2Fmembers';

    stubApi({
      [LOGIN_URL]: async () => jsonResponse(200, { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 900, user: USER }),
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'owner@gymly.test');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/members'));
  });

  it('ignores an absolute next value so login cannot be used as an open redirect', async () => {
    nav.pathname = '/login';
    nav.search = 'next=https%3A%2F%2Fevil.example.com';

    stubApi({
      [LOGIN_URL]: async () => jsonResponse(200, { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 900, user: USER }),
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'owner@gymly.test');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('rejects a malformed email without calling the API', async () => {
    renderWithAuth(<LoginForm />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Enter a valid email address.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires both fields', async () => {
    renderWithAuth(<LoginForm />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('invalid credentials', () => {
  const LOGIN_URL = 'http://localhost:3000/api/auth/login';

  it('shows an error, stores no token and stays on the form', async () => {
    stubApi({
      [LOGIN_URL]: async () =>
        jsonResponse(401, { statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' }),
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'owner@gymly.test');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Invalid email or password.');

    expect(readToken()).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveProperty('disabled', false);
  });

  it('disables the button while the attempt is in flight', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubApi({
      [LOGIN_URL]: async () => {
        await gate;
        return jsonResponse(401, { statusCode: 401, message: 'Invalid email or password' });
      },
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'owner@gymly.test');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const pending = await screen.findByRole('button', { name: 'Signing in…' });
    expect(pending).toHaveProperty('disabled', true);

    release?.();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('protected routes', () => {
  const ME_URL = 'http://localhost:3000/api/auth/me';

  it('redirects an unauthenticated visitor to login with their destination', async () => {
    renderWithAuth(
      <ProtectedRoute>
        <p>Secret area</p>
      </ProtectedRoute>,
    );

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fdashboard'));
    expect(screen.queryByText('Secret area')).toBeNull();
  });

  it('shows a loading state instead of the protected content while the token is being checked', async () => {
    writeToken(TOKEN);
    stubApi({ [ME_URL]: () => new Promise<Response>(() => {}) });

    renderWithAuth(
      <ProtectedRoute>
        <p>Secret area</p>
      </ProtectedRoute>,
    );

    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Loading your session…');
    expect(screen.queryByText('Secret area')).toBeNull();
  });

  it('renders the protected content for a valid session', async () => {
    writeToken(TOKEN);
    stubApi({ [ME_URL]: async () => jsonResponse(200, { user: USER }) });

    renderWithAuth(
      <ProtectedRoute>
        <p>Secret area</p>
      </ProtectedRoute>,
    );

    expect(await screen.findByText('Secret area')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('sends the stored token when validating the session', async () => {
    writeToken(TOKEN);
    stubApi({ [ME_URL]: async () => jsonResponse(200, { user: USER }) });

    renderWithAuth(
      <ProtectedRoute>
        <p>Secret area</p>
      </ProtectedRoute>,
    );

    await screen.findByText('Secret area');
    expect(recordedCall().headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('discards an expired token and redirects rather than trusting storage', async () => {
    writeToken('expired-token');
    stubApi({
      [ME_URL]: async () => jsonResponse(401, { statusCode: 401, message: 'Invalid email or password' }),
    });

    renderWithAuth(
      <ProtectedRoute>
        <p>Secret area</p>
      </ProtectedRoute>,
    );

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fdashboard'));
    expect(readToken()).toBeNull();
    expect(screen.queryByText('Secret area')).toBeNull();
  });

  it('discards the session when the account is no longer active', async () => {
    writeToken(TOKEN);
    stubApi({
      [ME_URL]: async () => jsonResponse(403, { statusCode: 403, message: 'This account is suspended.' }),
    });

    renderWithAuth(
      <ProtectedRoute>
        <p>Secret area</p>
      </ProtectedRoute>,
    );

    await waitFor(() => expect(readToken()).toBeNull());
    expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fdashboard');
  });

  it('treats an unreachable API as signed out rather than leaving the UI loading forever', async () => {
    writeToken(TOKEN);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    renderWithAuth(
      <ProtectedRoute>
        <p>Secret area</p>
      </ProtectedRoute>,
    );

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fdashboard'));
    // The protected content stays hidden; the redirect is what resolves the view.
    expect(screen.queryByText('Secret area')).toBeNull();
    expect(readToken()).toBeNull();
  });
});

describe('logout', () => {
  const ME_URL = 'http://localhost:3000/api/auth/me';
  const LOGIN_URL = 'http://localhost:3000/api/auth/login';

  function AccountPanel() {
    const { user, logout } = useAuth();

    return (
      <ProtectedRoute>
        <p>Signed in as {user?.email}</p>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </ProtectedRoute>
    );
  }

  it('clears the token, blocks the protected area and returns to login', async () => {
    writeToken(TOKEN);
    stubApi({ [ME_URL]: async () => jsonResponse(200, { user: USER }) });

    const user = userEvent.setup();
    renderWithAuth(<AccountPanel />);

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(readToken()).toBeNull();
    expect(nav.replace).toHaveBeenCalledWith('/login');
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fdashboard'));
    expect(callsTo(LOGIN_URL)).toHaveLength(0);
  });

  it('signs out even if the user is signed in through the form', async () => {
    writeToken(TOKEN);
    stubApi({ [ME_URL]: async () => jsonResponse(200, { user: USER }) });

    const user = userEvent.setup();
    renderWithAuth(<AccountPanel />);

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(readToken()).toBeNull());
  });
});

describe('api error states', () => {
  const LOGIN_URL = 'http://localhost:3000/api/auth/login';

  async function submitCredentials() {
    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);
    await user.type(screen.getByLabelText('Email'), 'owner@gymly.test');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('explains an inactive account when the API returns 403', async () => {
    stubApi({
      [LOGIN_URL]: async () =>
        jsonResponse(403, {
          statusCode: 403,
          message: 'This account is suspended. Contact an owner to reactivate it.',
        }),
    });

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'This account is suspended. Contact an owner to reactivate it.',
    );
    expect(readToken()).toBeNull();
  });

  it('surfaces the validation messages the API returns for 400', async () => {
    stubApi({
      [LOGIN_URL]: async () =>
        jsonResponse(400, { statusCode: 400, message: ['password must not be empty'] }),
    });

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'password must not be empty');
  });

  it('shows the server message for an unexpected 500', async () => {
    stubApi({
      [LOGIN_URL]: async () =>
        jsonResponse(500, { statusCode: 500, message: 'Internal server error' }),
    });

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Internal server error');
  });

  it('reports an unreachable server rather than a blank failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Could not reach the Gymly server. Check your connection.',
    );
    expect(readToken()).toBeNull();
  });

  it('clears the previous error when the user retries', async () => {
    let attempt = 0;
    stubApi({
      [LOGIN_URL]: async () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse(401, { statusCode: 401, message: 'Invalid email or password' })
          : jsonResponse(200, { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 900, user: USER });
      },
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'owner@gymly.test');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toBeTruthy();

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});