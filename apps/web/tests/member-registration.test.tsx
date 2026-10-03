import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import NewMemberPage from '../app/(protected)/members/new/page';
import { writeToken } from '../lib/auth-storage';
import type { Member } from '../lib/member-types';
import { installFetchMock, jsonResponse, type RecordedCall } from './test-utils';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  pathname: '/members/new',
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const MEMBERS_URL = 'http://localhost:3000/api/members';
const TOKEN = 'valid.jwt.token';

const VALID = {
  firstName: 'Grace',
  lastName: 'Wanjiku',
  phone: '+254712345678',
};

let fetchMock: Mock;
let recordedCall: (index?: number) => RecordedCall;

const created: Member = {
  id: 'member-1',
  memberCode: 'GYM-000001',
  firstName: 'Grace',
  lastName: 'Wanjiku',
  phone: '+254712345678',
  email: null,
  dateOfBirth: null,
  gender: null,
  address: null,
  emergencyContact: null,
  status: 'PENDING',
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z',
};

function lastCall(): RecordedCall {
  return recordedCall(fetchMock.mock.calls.length - 1);
}

function stubCreate(response: () => Promise<Response>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url !== MEMBERS_URL) throw new Error(`Unstubbed request to ${url}`);

    return response();
  });
}

/** Fills the required fields and submits, optionally adding more first. */
async function submitForm(user: ReturnType<typeof userEvent.setup>, fill?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  if (fill !== undefined) await fill(user);

  await user.click(screen.getByRole('button', { name: 'Register member' }));
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, overrides: Partial<typeof VALID> = {}) {
  const values = { ...VALID, ...overrides };

  await user.clear(screen.getByLabelText(/First name/));
  await user.type(screen.getByLabelText(/First name/), values.firstName);
  await user.clear(screen.getByLabelText(/Last name/));
  await user.type(screen.getByLabelText(/Last name/), values.lastName);
  await user.clear(screen.getByLabelText(/Phone/));
  await user.type(screen.getByLabelText(/Phone/), values.phone);
}

beforeEach(() => {
  const handle = installFetchMock();
  fetchMock = handle.fetchMock;
  recordedCall = handle.recordedCall;

  nav.replace.mockReset();
  nav.push.mockReset();
  nav.back.mockReset();
  nav.pathname = '/members/new';
  writeToken(TOKEN);
  stubCreate(async () => jsonResponse(201, created));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registering a member', () => {
  it('renders every field the API accepts', () => {
    render(<NewMemberPage />);

    expect(screen.getByLabelText(/First name/)).toBeTruthy();
    expect(screen.getByLabelText(/Last name/)).toBeTruthy();
    expect(screen.getByLabelText(/Phone/)).toBeTruthy();
    expect(screen.getByLabelText(/^Email/)).toBeTruthy();
    expect(screen.getByLabelText(/Date of birth/)).toBeTruthy();
    expect(screen.getByLabelText(/Gender/)).toBeTruthy();
    expect(screen.getByLabelText(/Address/)).toBeTruthy();
    expect(screen.getByLabelText(/Emergency contact/)).toBeTruthy();
  });

  it('never offers a member code field, because the API assigns it', () => {
    render(<NewMemberPage />);

    // No input carries memberCode in its name or id, so there is nothing to fill
    // in and nothing to send.
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));

    expect(
      inputs.some(
        (element) =>
          element.getAttribute('name')?.toLowerCase().includes('membercode') === true ||
          element.getAttribute('id')?.toLowerCase().includes('membercode') === true,
      ),
    ).toBe(false);
  });

  it('sends only the required fields when the optional ones are left blank', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await fillRequired(user);
    await submitForm(user);

    await waitFor(() => {
      expect(lastCall().method).toBe('POST');
    });

    expect(lastCall().json()).toEqual(VALID);
  });

  it('sends the optional fields that were filled in', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, async (u) => {
      await fillRequired(u);
      await u.type(screen.getByLabelText(/^Email/), 'grace@gymly.test');
      await u.type(screen.getByLabelText(/Date of birth/), '1995-06-15');
      await u.selectOptions(screen.getByLabelText(/Gender/), 'FEMALE');
      await u.type(screen.getByLabelText(/Address/), '12 Kenyatta Avenue');
      await u.type(screen.getByLabelText(/Emergency contact/), 'Peter, +254722000111');
    });

    await waitFor(() => {
      expect(lastCall().json()).toEqual({
        ...VALID,
        email: 'grace@gymly.test',
        dateOfBirth: '1995-06-15',
        gender: 'FEMALE',
        address: '12 Kenyatta Avenue',
        emergencyContact: 'Peter, +254722000111',
      });
    });
  });

  it('attaches the session token', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    await waitFor(() => {
      expect(lastCall().headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    });
  });

  it('opens the record that was just created', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('/members/member-1');
    });
  });

  it('prevents a second submission while the first is in flight', async () => {
    // A holder, not a bare variable: the assignment happens inside the executor,
    // which the type checker cannot see through.
    const gate = { open: null as null | (() => void) };
    const pending = new Promise<void>((resolve) => {
      gate.open = resolve;
    });

    stubCreate(async () => {
      await pending;

      return jsonResponse(201, created);
    });

    const user = userEvent.setup();

    render(<NewMemberPage />);
    await fillRequired(user);

    const button = screen.getByRole('button', { name: 'Register member' });
    await user.click(button);

    expect(await screen.findByRole('button', { name: 'Registering…' })).toHaveProperty(
      'disabled',
      true,
    );

    // A form can still be submitted with Enter while the request is open, so the
    // guard is the handler, not only the disabled button.
    await user.click(button);
    expect(fetchMock.mock.calls.length).toBe(1);

    gate.open?.();
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalled();
    });
  });

  it('reports an expired session instead of posting', async () => {
    window.localStorage.clear();

    const user = userEvent.setup();

    render(<NewMemberPage />);
    await fillRequired(user);
    await submitForm(user);

    expect(
      await screen.findByText('Your session has ended. Sign in again to register a member.'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the duplicate member response', () => {
  beforeEach(() => {
    stubCreate(async () =>
      jsonResponse(409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'A member with this phone number already exists',
      }),
    );
  });

  it('explains that the phone is already registered and what to do', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    expect(
      await screen.findByText(
        'A member with this phone number already exists. Search for them and edit their record instead.',
      ),
    ).toBeTruthy();
  });

  it('keeps what was typed so the person does not retype it', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    await screen.findByText(/already exists/);

    expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('Grace');
    expect((screen.getByLabelText(/Phone/) as HTMLInputElement).value).toBe('+254712345678');
  });

  it('allows the submission to be retried once the duplicate is resolved', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);
    await screen.findByText(/already exists/);

    stubCreate(async () => jsonResponse(201, created));
    await submitForm(user);

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('/members/member-1');
    });
  });

  it('does not navigate away, so the record is not registered twice', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    await screen.findByText(/already exists/);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe('form validation', () => {
  it('refuses an empty form and explains each missing field', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user);

    expect(await screen.findByText('Enter the first name.')).toBeTruthy();
    expect(screen.getByText('Enter the last name.')).toBeTruthy();
    expect(screen.getByText('Enter the phone number.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a blank first name', { firstName: '   ' }, 'Enter the first name.'],
    [
      'a phone with too few digits',
      { phone: '12345' },
      'Phone number must contain 7-15 digits.',
    ],
    [
      'a phone with too many digits',
      { phone: '1234567890123456' },
      'Phone number must contain 7-15 digits.',
    ],
  ])('refuses %s', async (_label, override, message) => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, (u) => fillRequired(u, override as Partial<typeof VALID>));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a malformed email but accepts a missing one', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, async (u) => {
      await fillRequired(u);
      await u.type(screen.getByLabelText(/^Email/), 'not-an-email');
    });

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a date of birth in the future', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, async (u) => {
      await fillRequired(u);
      await u.type(screen.getByLabelText(/Date of birth/), '2099-01-01');
    });

    expect(await screen.findByText('Date of birth must be in the past.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks the invalid control for assistive technology', async () => {
    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user);

    await screen.findByText('Enter the phone number.');

    expect(screen.getByLabelText(/Phone/)).toHaveProperty('ariaInvalid', 'true');
  });
});

describe('API errors during registration', () => {
  it('shows the API message for a rejected request', async () => {
    stubCreate(async () =>
      jsonResponse(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: ['phone must contain 7-15 digits'],
      }),
    );

    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    expect(await screen.findByText('phone must contain 7-15 digits')).toBeTruthy();
  });

  it('reports a permission failure without echoing the raw status', async () => {
    stubCreate(async () =>
      jsonResponse(403, {
        statusCode: 403,
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
      }),
    );

    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    expect(
      await screen.findByText('You do not have permission to manage members. Ask an owner for access.'),
    ).toBeTruthy();
  });

  it('reports an unreachable server', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });

    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    expect(
      await screen.findByText('Could not reach the Gymly server. Check your connection and try again.'),
    ).toBeTruthy();
  });

  it('leaves the form usable after a failure', async () => {
    stubCreate(async () => jsonResponse(500, { statusCode: 500, error: 'Error', message: 'boom' }));

    const user = userEvent.setup();

    render(<NewMemberPage />);
    await submitForm(user, fillRequired);

    await screen.findByText('boom');
    expect(screen.getByRole('button', { name: 'Register member' })).toHaveProperty('disabled', false);
  });
});