import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import EditMemberPage from '../app/(protected)/members/[id]/edit/page';
import { writeToken } from '../lib/auth-storage';
import type { Member } from '../lib/member-types';
import { installFetchMock, jsonResponse, type RecordedCall } from './test-utils';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  pathname: '/members/member-1/edit',
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const BASE = 'http://localhost:3000/api';
const MEMBER_URL = `${BASE}/members/member-1`;
const TOKEN = 'valid.jwt.token';

const EXISTING: Member = {
  id: 'member-1',
  memberCode: 'GYM-000042',
  firstName: 'Grace',
  lastName: 'Wanjiku',
  phone: '+254712345678',
  email: 'grace@gymly.test',
  dateOfBirth: '1995-06-15',
  gender: 'FEMALE',
  address: '12 Kenyatta Avenue',
  emergencyContact: 'Peter Wanjiku',
  status: 'ACTIVE',
  createdAt: '2026-02-14T10:30:00.000Z',
  updatedAt: '2026-03-01T09:00:00.000Z',
};

let fetchMock: Mock;
let recordedCall: (index?: number) => RecordedCall;

function params(id = 'member-1') {
  return { params: Promise.resolve({ id }) };
}

function lastCall(): RecordedCall {
  return recordedCall(fetchMock.mock.calls.length - 1);
}

/** Answers the GET, then the PATCH with whatever the test wants. */
function stubRoutes(update: () => Promise<Response>, existing: Member = EXISTING) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === MEMBER_URL && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse(200, existing);
    }

    if (url === MEMBER_URL && init?.method === 'PATCH') {
      return update();
    }

    throw new Error(`Unstubbed request to ${init?.method ?? 'GET'} ${url}`);
  });
}

/** Waits for the member to load, then the form to be filled. */
async function renderEdit(existing: Member = EXISTING, update?: () => Promise<Response>) {
  stubRoutes(update ?? (async () => jsonResponse(200, EXISTING)), existing);

  const view = render(<EditMemberPage {...params()} />);

  await screen.findByDisplayValue(existing.firstName);

  return view;
}

beforeEach(() => {
  const handle = installFetchMock();
  fetchMock = handle.fetchMock;
  recordedCall = handle.recordedCall;

  nav.replace.mockReset();
  nav.push.mockReset();
  nav.back.mockReset();
  writeToken(TOKEN);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editing a member', () => {
  it('shows a loading state, then the stored details', async () => {
    // A holder, not a bare variable: the assignment happens inside the executor,
    // which the type checker cannot see through.
    const gate = { open: null as null | (() => void) };
    const pending = new Promise<void>((resolve) => {
      gate.open = resolve;
    });

    fetchMock.mockImplementation(async () => {
      await pending;

      return jsonResponse(200, EXISTING);
    });

    render(<EditMemberPage {...params()} />);

    expect(screen.getByText('Loading member…')).toBeTruthy();

    gate.open?.();
    expect(await screen.findByDisplayValue('Grace')).toBeTruthy();
  });

  it('fills every editable field from the record', async () => {
    await renderEdit();

    expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('Grace');
    expect((screen.getByLabelText(/Last name/) as HTMLInputElement).value).toBe('Wanjiku');
    expect((screen.getByLabelText(/Phone/) as HTMLInputElement).value).toBe('+254712345678');
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('grace@gymly.test');
    expect((screen.getByLabelText(/Date of birth/) as HTMLInputElement).value).toBe('1995-06-15');
    expect((screen.getByLabelText(/Gender/) as HTMLSelectElement).value).toBe('FEMALE');
    expect((screen.getByLabelText(/Address/) as HTMLTextAreaElement).value).toBe('12 Kenyatta Avenue');
  });

  it('shows the member code as fixed, with no way to change it', async () => {
    await renderEdit();

    // The code appears twice on the page: in the breadcrumb and as the note that
    // explains why there is no field for it.
    expect(screen.getAllByText('GYM-000042').length).toBeGreaterThan(0);
    expect(screen.getByText(/cannot be changed/)).toBeTruthy();
    expect(document.querySelector('input[name="memberCode"]')).toBeNull();
  });

  it('sends the whole form and returns to the record', async () => {
    await renderEdit(EXISTING, async () => jsonResponse(200, { ...EXISTING, firstName: 'Gracie' }));

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/First name/));
    await user.type(screen.getByLabelText(/First name/), 'Gracie');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('/members/member-1');
    });

    expect(lastCall().method).toBe('PATCH');

    // The form is the person's statement of the whole record, so every field it
    // owns is sent. It cannot write the member code or the status: neither is a
    // form field, and the API rejects them from a PATCH body anyway.
    expect(lastCall().json()).toEqual({
      firstName: 'Gracie',
      lastName: 'Wanjiku',
      phone: '+254712345678',
      email: 'grace@gymly.test',
      dateOfBirth: '1995-06-15',
      gender: 'FEMALE',
      address: '12 Kenyatta Avenue',
      emergencyContact: 'Peter Wanjiku',
    });
  });

  it('never sends a member code or a status in the update body', async () => {
    await renderEdit(EXISTING, async () => jsonResponse(200, EXISTING));

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Address/), ' x');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(lastCall().method).toBe('PATCH');
    });

    const body = lastCall().json() as Record<string, unknown>;

    expect(body['memberCode']).toBeUndefined();
    expect(body['status']).toBeUndefined();
  });

  it('sends a cleared optional field as null rather than as blank', async () => {
    await renderEdit(EXISTING, async () => jsonResponse(200, { ...EXISTING, address: null }));

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/Address/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(lastCall().json()).toMatchObject({ address: null });
    });
  });

  it('sends gender set back to not stated as null', async () => {
    await renderEdit(EXISTING, async () =>
      jsonResponse(200, { ...EXISTING, gender: null }),
    );

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Gender/), '');
    await user.type(screen.getByLabelText(/Phone/), '9');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(lastCall().json()).toMatchObject({
        phone: '+2547123456789',
        gender: null,
      });
    });
  });

  it('attaches the session token', async () => {
    await renderEdit();

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/Last name/));
    await user.type(screen.getByLabelText(/Last name/), 'Wanjiru');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(lastCall().headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    });
  });

  it('prevents a second save while the first is in flight', async () => {
    // A holder, not a bare variable: the assignment happens inside the executor,
    // which the type checker cannot see through.
    const gate = { open: null as null | (() => void) };
    const pending = new Promise<void>((resolve) => {
      gate.open = resolve;
    });

    await renderEdit(EXISTING, async () => {
      await pending;

      return jsonResponse(200, { ...EXISTING, lastName: 'Wanjiru' });
    });

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/Last name/));
    await user.type(screen.getByLabelText(/Last name/), 'Wanjiru');

    const save = screen.getByRole('button', { name: 'Save changes' });
    await user.click(save);

    expect(await screen.findByRole('button', { name: 'Saving…' })).toHaveProperty(
      'disabled',
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Saving…' }));

    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH').length).toBe(1);

    gate.open?.();
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalled();
    });
  });

  it('cancels back to the record without saving', async () => {
    await renderEdit();

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/First name/));
    await user.type(screen.getByLabelText(/First name/), 'Gracie');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(nav.push).toHaveBeenCalledWith('/members/member-1');
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH').length).toBe(0);
  });

  it('refuses a save that changes nothing, without calling the API', async () => {
    await renderEdit();

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Change something before saving.')).toBeTruthy();
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH').length).toBe(0);
  });

  it('refuses an invalid change and keeps the member untouched', async () => {
    await renderEdit();

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/Phone/));
    await user.type(screen.getByLabelText(/Phone/), '123');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Phone number must contain 7-15 digits.')).toBeTruthy();
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH').length).toBe(0);
  });

  it('refuses a blank required name', async () => {
    await renderEdit();

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/First name/));
    await user.type(screen.getByLabelText(/First name/), '   ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter the first name.')).toBeTruthy();
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH').length).toBe(0);
  });

  it('explains a duplicate phone rather than saving', async () => {
    await renderEdit(EXISTING, async () =>
      jsonResponse(409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'A member with this phone number already exists',
      }),
    );

    const user = userEvent.setup();

    await user.clear(screen.getByLabelText(/Phone/));
    await user.type(screen.getByLabelText(/Phone/), '+254722000111');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(
        'A member with this phone number already exists. Search for them and edit their record instead.',
      ),
    ).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('shows the API message for any other rejected change', async () => {
    await renderEdit(EXISTING, async () =>
      jsonResponse(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: ['address must be at most 500 characters'],
      }),
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Address/), ' x');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('address must be at most 500 characters')).toBeTruthy();
  });

  it('reports a member that cannot be loaded', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(404, { statusCode: 404, error: 'Not Found', message: 'Member not found' }),
    );

    render(<EditMemberPage {...params()} />);

    expect(
      await screen.findByText('That member could not be found. They may have been removed.'),
    ).toBeTruthy();
    // No form is offered for a record that does not exist.
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('reports an expired session', async () => {
    window.localStorage.clear();
    fetchMock.mockImplementation(async () => jsonResponse(200, EXISTING));

    render(<EditMemberPage {...params()} />);

    expect(
      await screen.findByText('Your session has ended. Sign in again to edit this member.'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});