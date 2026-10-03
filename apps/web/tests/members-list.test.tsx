import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { MembersList } from '../components/members/members-list';
import { writeToken } from '../lib/auth-storage';
import type { Member, MemberPage } from '../lib/member-types';
import { installFetchMock, jsonResponse, type RecordedCall } from './test-utils';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  pathname: '/members',
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const BASE = 'http://localhost:3000/api';
const MEMBERS_URL = `${BASE}/members`;
const TOKEN = 'valid.jwt.token';

let fetchMock: Mock;
let recordedCall: (index?: number) => RecordedCall;

function member(overrides: Partial<Member> = {}): Member {
  return {
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
    ...overrides,
  };
}

function page(members: Member[], overrides: Partial<MemberPage> = {}): MemberPage {
  return {
    members,
    total: members.length,
    page: 1,
    limit: 20,
    pageCount: members.length === 0 ? 0 : 1,
    ...overrides,
  };
}

/**
 * Answers the list endpoint whatever query it carries.
 *
 * The page always requests a page size, so the URL is never bare; matching on
 * the path alone means a test asserts on the query it cares about rather than
 * having to reproduce the whole one. Any other URL still fails loudly.
 */
function stubListWith(handler: (url: URL) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (url: string) => {
    const parsed = new URL(url);

    if (parsed.origin + parsed.pathname !== MEMBERS_URL) {
      throw new Error(`Unstubbed request to ${url}`);
    }

    return handler(parsed);
  });
}

/** Answers the list endpoint with a fixed page of members. */
function stubList(members: Member[] = [member()], overrides: Partial<MemberPage> = {}) {
  stubListWith(() => jsonResponse(200, page(members, overrides)));
}

/** Renders the list signed in, so a bearer token is attached. */
function renderList() {
  writeToken(TOKEN);

  return render(<MembersList />);
}

/** Renders the list with no session, as after the token expired. */
function renderListSignedOut() {
  window.localStorage.clear();

  return render(<MembersList />);
}

/** The most recent request, for assertions about a later interaction. */
function lastCall(): RecordedCall {
  const count = fetchMock.mock.calls.length;

  return recordedCall(count - 1);
}

beforeEach(() => {
  const handle = installFetchMock();
  fetchMock = handle.fetchMock;
  recordedCall = handle.recordedCall;
  nav.pathname = '/members';
  nav.search = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the members list', () => {
  it('loads members from the API with the session token', async () => {
    stubList();

    renderList();

    expect(await screen.findByText('GYM-000001')).toBeTruthy();

    const call = recordedCall(0);
    expect(call.url.startsWith(MEMBERS_URL)).toBe(true);
    expect(call.headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('shows the code, name, phone, status and registration date', async () => {
    stubList([
      member({
        memberCode: 'GYM-000042',
        firstName: 'Amina',
        lastName: 'Abdi',
        phone: '+254733000222',
        status: 'ACTIVE',
        createdAt: '2026-02-14T10:30:00.000Z',
      }),
    ]);

    renderList();

    const row = (await screen.findByText('GYM-000042')).closest('tr') as HTMLElement;

    expect(within(row).getByText('Amina Abdi')).toBeTruthy();
    expect(within(row).getByText('+254733000222')).toBeTruthy();
    expect(within(row).getByText('Active')).toBeTruthy();
    expect(within(row).getByText('2026-02-14')).toBeTruthy();
  });

  it('shows a loading state before the members arrive', async () => {
    // A holder, not a bare variable: the assignment happens inside the executor,
    // which the type checker cannot see through.
    const gate = { open: null as null | (() => void) };
    const pending = new Promise<void>((resolve) => {
      gate.open = resolve;
    });

    stubListWith(async () => {
      await pending;

      return jsonResponse(200, page([member()]));
    });

    renderList();

    expect(screen.getByText('Loading members…')).toBeTruthy();

    gate.open?.();
    expect(await screen.findByText('GYM-000001')).toBeTruthy();
  });

  it('shows an empty state with a way to register the first member', async () => {
    stubList([]);

    renderList();

    expect(await screen.findByText('No members registered yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Register the first member' })).toBeTruthy();
  });

  it('shows an API error and can retry', async () => {
    let attempt = 0;

    stubListWith(() => {
      attempt += 1;

      return attempt === 1
        ? jsonResponse(500, { statusCode: 500, error: 'Internal server error', message: 'boom' })
        : jsonResponse(200, page([member()]));
    });

    renderList();

    expect(await screen.findByText('boom')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('GYM-000001')).toBeTruthy();
  });

  it('reports a forbidden response as a permission problem', async () => {
    stubListWith(() =>
      jsonResponse(403, {
        statusCode: 403,
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
      }),
    );

    renderList();

    expect(
      await screen.findByText('You do not have permission to manage members. Ask an owner for access.'),
    ).toBeTruthy();
  });

  it('reports an expired session rather than pretending there are no members', async () => {
    stubList();

    renderListSignedOut();

    expect(
      await screen.findByText('Your session has ended. Sign in again to view members.'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('links each row to that member and offers a register action', async () => {
    stubList();

    renderList();

    const [nameLink] = await screen.findAllByRole('link', { name: 'Grace Wanjiku' });
    expect(nameLink?.getAttribute('href')).toBe('/members/member-1');
    expect(screen.getByRole('link', { name: 'Register member' })).toBeTruthy();
  });
});

describe('searching members', () => {
  it('sends the typed term to the API', async () => {
    stubList();

    renderList();
    await screen.findByText('GYM-000001');

    await userEvent.setup().type(screen.getByLabelText('Search'), 'wanj');

    await waitFor(() => {
      expect(lastCall().url).toContain('q=wanj');
    });
  });

  it('trims the term and omits it entirely when it is blank', async () => {
    stubList();

    renderList();
    await screen.findByText('GYM-000001');

    const search = screen.getByLabelText('Search');
    await userEvent.setup().clear(search);

    await waitFor(() => {
      expect(lastCall().url).not.toContain('q=');
    });
  });

  it('shows the members the API returned for the search', async () => {
    stubList([member({ id: 'member-9', firstName: 'Peter', lastName: 'Otieno' })]);

    renderList();

    await userEvent.setup().type(await screen.findByLabelText('Search'), 'otieno');

    expect(await screen.findByText('Peter Otieno')).toBeTruthy();
  });

  it('reports a search that matched nothing, and offers to clear it', async () => {
    stubList();

    renderList();
    await screen.findByText('GYM-000001');

    stubList([]);
    await userEvent.setup().type(screen.getByLabelText('Search'), 'zzz');

    expect(await screen.findByText('No members match those filters.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });

  it('filters by status', async () => {
    stubList();

    renderList();
    await screen.findByText('GYM-000001');

    await userEvent.setup().selectOptions(screen.getByLabelText('Status'), 'ACTIVE');

    await waitFor(() => {
      expect(lastCall().url).toContain('status=ACTIVE');
    });
  });

  it('asks the API to hide deactivated members when the checkbox is cleared', async () => {
    stubList();

    renderList();
    await screen.findByText('GYM-000001');

    // Deactivated members are included by default, so an unticked box is the
    // request that has to say so explicitly.
    await userEvent.setup().click(screen.getByLabelText('Show deactivated'));

    await waitFor(() => {
      expect(lastCall().url).toContain('includeInactive=false');
    });
  });

  it('clears every filter at once', async () => {
    stubList();

    renderList();
    await screen.findByText('GYM-000001');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search'), 'grace');
    await user.selectOptions(screen.getByLabelText('Status'), 'ACTIVE');
    await user.click(screen.getByLabelText('Show deactivated'));

    await user.click(await screen.findByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      const url = lastCall().url;

      expect(url).not.toContain('q=');
      expect(url).not.toContain('status=');
      expect(url).not.toContain('includeInactive');
    });
  });
});

describe('paging the members list', () => {
  it('reports the total and only pages when there is more than one page', async () => {
    stubList([member()], { total: 45, page: 1, limit: 20, pageCount: 3 });

    renderList();

    expect(await screen.findByText('Showing 1 of 45 members')).toBeTruthy();
    expect(screen.getByText('Page 1 of 3')).toBeTruthy();
  });

  it('requests the next page', async () => {
    stubList([member()], { total: 45, page: 1, limit: 20, pageCount: 3 });

    renderList();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(lastCall().url).toContain('page=2');
    });
  });

  it('disables Previous on the first page', async () => {
    stubList([member()], { total: 45, page: 1, limit: 20, pageCount: 3 });

    renderList();

    expect(await screen.findByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true);
  });

  it('hides the pager when everything fits on one page', async () => {
    stubList();

    renderList();
    await screen.findByText('GYM-000001');

    expect(screen.queryByRole('navigation', { name: 'Member pages' })).toBeNull();
  });
});

