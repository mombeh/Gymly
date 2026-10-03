import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import MemberDetailsPage from '../app/(protected)/members/[id]/page';
import { writeToken } from '../lib/auth-storage';
import type { Member } from '../lib/member-types';
import { installFetchMock, jsonResponse, type RecordedCall } from './test-utils';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  pathname: '/members/member-1',
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const BASE = 'http://localhost:3000/api';
const MEMBER_URL = `${BASE}/members/member-1`;
const DEACTIVATE_URL = `${MEMBER_URL}/deactivate`;
const TOKEN = 'valid.jwt.token';

const FULL: Member = {
  id: 'member-1',
  memberCode: 'GYM-000042',
  firstName: 'Grace',
  lastName: 'Wanjiku',
  phone: '+254712345678',
  email: 'grace@gymly.test',
  dateOfBirth: '1995-06-15',
  gender: 'FEMALE',
  address: '12 Kenyatta Avenue, Nairobi',
  emergencyContact: 'Peter Wanjiku, +254722000111',
  status: 'ACTIVE',
  createdAt: '2026-02-14T10:30:00.000Z',
  updatedAt: '2026-03-01T09:00:00.000Z',
};

const SPARSE: Member = {
  ...FULL,
  email: null,
  dateOfBirth: null,
  gender: null,
  address: null,
  emergencyContact: null,
  status: 'PENDING',
};

let fetchMock: Mock;
let recordedCall: (index?: number) => RecordedCall;

/** The route params a Next.js page receives; awaited inside the page. */
function params(id = 'member-1') {
  return { params: Promise.resolve({ id }) };
}

function lastCall(): RecordedCall {
  return recordedCall(fetchMock.mock.calls.length - 1);
}

/** Answers GET the member, and optionally the deactivate call. */
function stubRoutes(routes: Record<string, () => Promise<Response>> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const handler = routes[url];

    if (handler === undefined) {
      throw new Error(`Unstubbed request to ${url}`);
    }

    return handler();
  });
}

function stubMember(member: Member = FULL, routes: Record<string, () => Promise<Response>> = {}) {
  stubRoutes({
    [MEMBER_URL]: async () => jsonResponse(200, member),
    ...routes,
  });
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

describe('member details', () => {
  it('shows a loading state before the member arrives', async () => {
    // A holder, not a bare variable: the assignment happens inside the executor,
    // which the type checker cannot see through.
    const gate = { open: null as null | (() => void) };
    const pending = new Promise<void>((resolve) => {
      gate.open = resolve;
    });

    stubRoutes({
      [MEMBER_URL]: async () => {
        await pending;

        return jsonResponse(200, FULL);
      },
    });

    render(<MemberDetailsPage {...params()} />);

    expect(screen.getByText('Loading member…')).toBeTruthy();

    gate.open?.();
    expect(await screen.findByRole('heading', { name: 'Grace Wanjiku' })).toBeTruthy();
  });

  it('requests the member by id with the session token', async () => {
    stubMember();

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    expect(lastCall().url).toBe(MEMBER_URL);
    expect(lastCall().headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('shows the member code and registration date', async () => {
    stubMember();

    render(<MemberDetailsPage {...params()} />);

    const note = (await screen.findByText(/Member code/)).textContent ?? '';

    expect(note).toContain('GYM-000042');
    expect(note).toContain('2026-02-14');
  });

  it('shows the whole profile', async () => {
    stubMember();

    render(<MemberDetailsPage {...params()} />);

    const profile = (await screen.findByRole('heading', { name: 'Profile' }))
      .closest('section') as HTMLElement;

    for (const [term, value] of [
      ['First name', 'Grace'],
      ['Last name', 'Wanjiku'],
      ['Phone', '+254712345678'],
      ['Email', 'grace@gymly.test'],
      ['Date of birth', '1995-06-15'],
      ['Gender', 'Female'],
      ['Address', '12 Kenyatta Avenue, Nairobi'],
      ['Emergency contact', 'Peter Wanjiku, +254722000111'],
      ['Last updated', '2026-03-01'],
    ] as const) {
      expect(within(profile).getByText(term)).toBeTruthy();
      expect(within(profile).getByText(value)).toBeTruthy();
    }
  });

  it('says so plainly when an optional field was never given', async () => {
    stubMember(SPARSE);

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0);
    expect(screen.getByText('Not stated')).toBeTruthy();
  });

  it('shows the member status', async () => {
    stubMember({ ...SPARSE, status: 'SUSPENDED' });

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    expect(screen.getByText('Suspended')).toBeTruthy();
  });

  it('offers an edit link and a deactivate action', async () => {
    stubMember();

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    expect(screen.getByRole('link', { name: 'Edit member' }).getAttribute('href')).toBe(
      '/members/member-1/edit',
    );
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy();
  });

  it('has no deactivate action for an already deactivated member', async () => {
    stubMember({ ...SPARSE, status: 'INACTIVE' });

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows an API error for a member that cannot be loaded', async () => {
    stubRoutes({
      [MEMBER_URL]: async () =>
        jsonResponse(404, { statusCode: 404, error: 'Not Found', message: 'Member not found' }),
    });

    render(<MemberDetailsPage {...params()} />);

    expect(
      await screen.findByText('That member could not be found. They may have been removed.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to members' })).toBeTruthy();
  });

  it('reports an expired session', async () => {
    window.localStorage.clear();
    stubMember();

    render(<MemberDetailsPage {...params()} />);

    expect(
      await screen.findByText('Your session has ended. Sign in again to view this member.'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('membership, payment and attendance placeholders', () => {
  it('names each section that is not built yet', async () => {
    stubMember();

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    expect(screen.getByRole('heading', { name: 'Membership history' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Payment history' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Attendance history' })).toBeTruthy();
  });

  it('invents no records in those sections', async () => {
    stubMember();

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    // Only one member request was made: no membership, payment or attendance
    // endpoint was called, so nothing could have been invented.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastCall().url).toBe(MEMBER_URL);

    for (const heading of ['Membership history', 'Payment history', 'Attendance history']) {
      const section = screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

      expect(within(section).queryByRole('table')).toBeNull();
      expect(within(section).queryByRole('list')).toBeNull();
    }
  });

  it('says why each section is empty', async () => {
    stubMember();

    render(<MemberDetailsPage {...params()} />);
    await screen.findByRole('heading', { name: 'Grace Wanjiku' });

    expect(screen.getByText(/once the membership API exists/)).toBeTruthy();
    expect(screen.getByText(/once the payments API exists/)).toBeTruthy();
    expect(screen.getByText(/once the attendance API exists/)).toBeTruthy();
  });
});

describe('deactivating a member', () => {
  it('asks for confirmation before doing anything', async () => {
    stubMember();

    const user = userEvent.setup();

    render(<MemberDetailsPage {...params()} />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('heading', { name: 'Deactivate Grace Wanjiku?' })).toBeTruthy();
    // Nothing was sent while the question was on screen.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains that the record is kept', async () => {
    stubMember();

    const user = userEvent.setup();

    render(<MemberDetailsPage {...params()} />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('The member record is kept');
  });

  it('deactivates on confirmation and shows the new status', async () => {
    stubMember(FULL, {
      [DEACTIVATE_URL]: async () => jsonResponse(200, { ...FULL, status: 'INACTIVE' }),
    });

    const user = userEvent.setup();

    render(<MemberDetailsPage {...params()} />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await user.click(await screen.findByRole('button', { name: 'Deactivate member' }));

    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeTruthy();
    });

    expect(lastCall().method).toBe('PATCH');
    expect(lastCall().url).toBe(DEACTIVATE_URL);
    // The record still shows, because deactivating is not deleting.
    expect(screen.getByRole('heading', { name: 'Grace Wanjiku' })).toBeTruthy();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    stubMember();

    const user = userEvent.setup();

    render(<MemberDetailsPage {...params()} />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('closes the confirmation when the backdrop is clicked', async () => {
    stubMember();

    const user = userEvent.setup();

    render(<MemberDetailsPage {...params()} />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await screen.findByRole('dialog');

    const backdrop = document.querySelector('.modal-backdrop') as HTMLElement;
    await user.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prevents a double click from sending the request twice', async () => {
    // A holder, not a bare variable: the assignment happens inside the executor,
    // which the type checker cannot see through.
    const gate = { open: null as null | (() => void) };
    const pending = new Promise<void>((resolve) => {
      gate.open = resolve;
    });

    stubMember(FULL, {
      [DEACTIVATE_URL]: async () => {
        await pending;

        return jsonResponse(200, { ...FULL, status: 'INACTIVE' });
      },
    });

    const user = userEvent.setup();

    render(<MemberDetailsPage {...params()} />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));

    const confirm = await screen.findByRole('button', { name: 'Deactivate member' });
    await user.click(confirm);

    const busy = await screen.findByRole('button', { name: 'Deactivating…' });
    expect(busy).toHaveProperty('disabled', true);

    await user.click(busy);
    expect(fetchMock.mock.calls.length).toBe(2);

    gate.open?.();
    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeTruthy();
    });
  });

  it('keeps the dialog open and explains a failure', async () => {
    stubMember(FULL, {
      [DEACTIVATE_URL]: async () =>
        jsonResponse(409, {
          statusCode: 409,
          error: 'Conflict',
          message: 'A member with this phone number already exists',
        }),
    });

    const user = userEvent.setup();

    render(<MemberDetailsPage {...params()} />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await user.click(await screen.findByRole('button', { name: 'Deactivate member' }));

    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });
});