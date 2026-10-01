import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { LoginForm } from '../components/login-form';
import { RegisterForm } from '../components/register-form';
import { readToken } from '../lib/auth-storage';
import { AuthProvider } from '../lib/auth-context';
import { safeNextPath } from '../lib/navigation';
import { installFetchMock, jsonResponse, stubApi, type RecordedCall } from './test-utils';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/register',
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const REGISTER_URL = 'http://localhost:3000/api/auth/register';

const USER = {
  id: 'user-1',
  email: 'nkwenu@gmail.com',
  firstName: 'Nkwenu',
  lastName: 'Inadine',
  role: 'MEMBER' as const,
  status: 'ACTIVE' as const,
};

const VALID = {
  firstName: 'Nkwenu',
  lastName: 'Inadine',
  email: 'nkwenu@gmail.com',
  password: 'correct-horse',
  confirmPassword: 'correct-horse',
};

let fetchMock: Mock;
let recordedCall: (index?: number) => RecordedCall;

function stub(routes: Record<string, () => Promise<Response>>) {
  stubApi(fetchMock, routes);
}

function renderWithAuth(ui: ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

/** Fills the whole registration form with the given overrides. */
async function fillRegisterForm(overrides: Partial<typeof VALID> = {}) {
  const user = userEvent.setup();
  const values = { ...VALID, ...overrides };

  renderWithAuth(<RegisterForm />);

  const [firstName, lastName, email, password, confirmPassword] = [
    screen.getByLabelText('First name'),
    screen.getByLabelText('Last name'),
    screen.getByLabelText('Email'),
    screen.getByLabelText('Password'),
    screen.getByLabelText('Confirm password'),
  ];

  await user.type(firstName, values.firstName);
  await user.type(lastName, values.lastName);
  await user.type(email, values.email);
  await user.type(password, values.password);
  await user.type(confirmPassword, values.confirmPassword);

  await user.click(screen.getByRole('button', { name: 'Create account' }));

  return user;
}

function successResponse() {
  return jsonResponse(201, {
    accessToken: 'new.jwt.token',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: USER,
  });
}

beforeEach(() => {
  // Installed per test because afterEach removes the global stub.
  const handle = installFetchMock();
  fetchMock = handle.fetchMock;
  recordedCall = handle.recordedCall;

  nav.replace.mockReset();
  nav.push.mockReset();
  nav.pathname = '/register';
  nav.search = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registration', () => {
  it('creates the account, stores the token and goes to the dashboard', async () => {
    stub({ [REGISTER_URL]: async () => successResponse() });

    await fillRegisterForm();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard'));

    expect(recordedCall().url).toBe(REGISTER_URL);
    expect(recordedCall().method).toBe('POST');
    expect(recordedCall().json()).toEqual({
      firstName: 'Nkwenu',
      lastName: 'Inadine',
      email: 'nkwenu@gmail.com',
      password: 'correct-horse',
    });
    expect(readToken()).toBe('new.jwt.token');
  });

  it('never sends the confirmation field to the API', async () => {
    stub({ [REGISTER_URL]: async () => successResponse() });

    await fillRegisterForm();

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(recordedCall().body).not.toContain('confirmPassword');
  });

  it('returns to the originally requested page when next is set', async () => {
    nav.search = 'next=%2Fmembers';
    stub({ [REGISTER_URL]: async () => successResponse() });

    await fillRegisterForm();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/members'));
  });

  it('disables the button while the account is being created', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    stub({
      [REGISTER_URL]: async () => {
        await gate;
        return successResponse();
      },
    });

    await fillRegisterForm();

    const pending = await screen.findByRole('button', { name: 'Creating account…' });
    expect(pending).toHaveProperty('disabled', true);

    release?.();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  });
});

describe('registration validation', () => {
  it('requires every field', async () => {
    renderWithAuth(<RegisterForm />);

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter your first name.')).toBeTruthy();
    expect(screen.getByText('Enter your last name.')).toBeTruthy();
    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Choose a password.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not complain about a mismatch when both password fields are empty', async () => {
    renderWithAuth(<RegisterForm />);

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Choose a password.')).toBeTruthy();
    expect(screen.queryByText('Passwords do not match.')).toBeNull();
  });

  it('rejects a malformed email without calling the API', async () => {
    await fillRegisterForm({ email: 'not-an-email', confirmPassword: 'correct-horse' });

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces the minimum password length the API demands', async () => {
    await fillRegisterForm({ password: 'short1', confirmPassword: 'short1' });

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords before submitting', async () => {
    await fillRegisterForm({ confirmPassword: 'something-else' });

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides the length hint once the password is too short', async () => {
    renderWithAuth(<RegisterForm />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Password'), 'short1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(screen.queryByText('At least 8 characters.')).toBeNull();
  });
});

describe('registration errors', () => {
  it('points a duplicate address at signing in', async () => {
    stub({
      [REGISTER_URL]: async () =>
        jsonResponse(409, { statusCode: 409, message: 'An account with this email already exists' }),
    });

    await fillRegisterForm();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'An account with this email already exists. Try signing in instead.',
    );
    expect(readToken()).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('surfaces the API validation messages', async () => {
    stub({
      [REGISTER_URL]: async () =>
        jsonResponse(400, { statusCode: 400, message: ['email must be a valid email address'] }),
    });

    await fillRegisterForm();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'email must be a valid email address',
    );
  });

  it('reports an unreachable server', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await fillRegisterForm();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Could not reach the Gymly server. Check your connection.',
    );
  });
});

describe('password visibility toggle', () => {
  it('reveals and re-hides the password on the login form', async () => {
    renderWithAuth(<LoginForm />);
    const user = userEvent.setup();

    const field = screen.getByLabelText('Password');
    expect(field).toHaveProperty('type', 'password');

    const show = screen.getByRole('button', { name: 'Show password' });
    await user.click(show);

    const revealed = screen.getByLabelText('Password');
    expect(revealed).toHaveProperty('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveProperty('type', 'password');
  });

  it('exposes the toggle state to assistive technology', async () => {
    renderWithAuth(<LoginForm />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Show password' }).getAttribute('aria-pressed')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('offers a toggle on each password field of the registration form', async () => {
    renderWithAuth(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByLabelText('Password')).toHaveProperty('type', 'text');
    // Toggling one field must not reveal the other.
    expect(screen.getByLabelText('Confirm password')).toHaveProperty('type', 'password');
  });

  it('still submits the real password after being revealed', async () => {
    stub({
      'http://localhost:3000/api/auth/login': async () =>
        jsonResponse(200, { accessToken: 't', tokenType: 'Bearer', expiresIn: 900, user: USER }),
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'nkwenu@gmail.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect((recordedCall().json() as { password: string }).password).toBe('correct-horse');
  });
});

describe('moving between the two forms', () => {
  it('offers registration from the login page and keeps the destination', () => {
    nav.pathname = '/login';
    nav.search = 'next=%2Fmembers';

    renderWithAuth(<LoginForm />);

    // jsdom resolves relative hrefs to absolute, so the raw attribute is compared.
    const link = screen.getByRole('link', { name: 'Register' });
    expect(link.getAttribute('href')).toBe('/register?next=%2Fmembers');
  });

  it('offers sign-in from the registration page', () => {
    renderWithAuth(<RegisterForm />);

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  });

  it('states which way round the user is', () => {
    nav.pathname = '/login';
    renderWithAuth(<LoginForm />);
    expect(screen.getByText(/Don.t have an account\?/)).toBeTruthy();

    cleanup();

    renderWithAuth(<RegisterForm />);
    expect(screen.getByText(/Already have an account\?/)).toBeTruthy();
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/members', '/members'],
    ['/dashboard', '/dashboard'],
    [null, '/dashboard'],
    // Open-redirect attempts are discarded rather than followed.
    ['https://evil.example.com', '/dashboard'],
    ['//evil.example.com', '/dashboard'],
    ['/\\evil.example.com', '/dashboard'],
    ['/\\evil.com', '/dashboard'],
    ['members', '/dashboard'],
    ['', '/dashboard'],
  ])('resolves %s to %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});