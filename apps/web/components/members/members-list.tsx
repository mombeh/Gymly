'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { readToken } from '../../lib/auth-storage';
import { describeMemberError, listMembers } from '../../lib/members-api';
import { memberStatusLabel, type Member, type MemberStatus } from '../../lib/member-types';

/** Rows per page, matching the API's own default so one rule governs both. */
const PAGE_SIZE = 20;

type LoadState = 'loading' | 'ready' | 'error';

export function MembersList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<MemberStatus | ''>('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const token = readToken();

      if (token === null) {
        setState('error');
        setError('Your session has ended. Sign in again to view members.');

        return;
      }

      setState('loading');
      setError(null);

      try {
        const result = await listMembers(
          {
            q: term,
            status: status === '' ? undefined : status,
            page,
            limit: PAGE_SIZE,
            includeInactive,
          },
          token,
          signal,
        );

        setMembers(result.members);
        setTotal(result.total);
        setPageCount(result.pageCount);
        setState('ready');
      } catch (caught) {
        // An aborted request is this component unmounting or a newer search
        // superseding this one; the newer call reports its own outcome.
        if (signal.aborted) return;

        setState('error');
        setError(describeMemberError(caught, 'load'));
      }
    },
    [term, status, page, includeInactive],
  );

  useEffect(() => {
    const controller = new AbortController();

    void load(controller.signal);

    return () => controller.abort();
  }, [load]);

  // A new search starts from the first page; staying on page 3 of a shorter
  // result set would show an empty table for a query that has matches.
  function applySearch(nextTerm: string, nextStatus: MemberStatus | '', nextInclude: boolean) {
    setTerm(nextTerm);
    setStatus(nextStatus);
    setIncludeInactive(nextInclude);
    setPage(1);
  }

  function clearSearch() {
    setTerm('');
    setStatus('');
    setIncludeInactive(true);
    setPage(1);
  }

  const isFiltered = term.trim() !== '' || status !== '' || !includeInactive;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-note">
            Everyone registered at the gym. Deactivated members stay listed so their history
            remains traceable.
          </p>
        </div>
        <Link className="btn btn-primary" href="/members/new">
          Register member
        </Link>
      </div>

      <section className="member-toolbar" aria-label="Search members">
        <div className="field">
          <label className="field-label" htmlFor="member-search">
            Search
          </label>
          <input
            id="member-search"
            name="q"
            type="search"
            className="field-input"
            placeholder="Name, member code or phone"
            value={term}
            onChange={(event) => applySearch(event.target.value, status, includeInactive)}
            disabled={state === 'loading'}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="member-status">
            Status
          </label>
          <select
            id="member-status"
            name="status"
            className="field-input"
            value={status}
            onChange={(event) => applySearch(term, event.target.value as MemberStatus | '', includeInactive)}
            disabled={state === 'loading'}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        <label className="checkbox" htmlFor="member-include-inactive">
          <input
            id="member-include-inactive"
            name="includeInactive"
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => applySearch(term, status, event.target.checked)}
            disabled={state === 'loading'}
          />
          Show deactivated
        </label>

        {isFiltered && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={clearSearch}
            disabled={state === 'loading'}
          >
            Clear
          </button>
        )}
      </section>

      {state === 'loading' && (
        <p className="state-message" role="status" aria-live="polite">
          Loading members…
        </p>
      )}

      {state === 'error' && error !== null && (
        <div className="state-message state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setPage((current) => current)}>
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && members.length === 0 && (
        <div className="state-message" role="status">
          {isFiltered ? (
            <>
              <p>No members match those filters.</p>
              <button type="button" className="btn btn-ghost" onClick={clearSearch}>
                Clear search
              </button>
            </>
          ) : (
            <>
              <p>No members registered yet.</p>
              <Link className="btn btn-primary" href="/members/new">
                Register the first member
              </Link>
            </>
          )}
        </div>
      )}

      {state === 'ready' && members.length > 0 && (
        <>
          <p className="state-summary" role="status" aria-live="polite">
            {members.length === total
              ? `${total} ${total === 1 ? 'member' : 'members'}`
              : `Showing ${members.length} of ${total} members`}
          </p>

          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Registered members</caption>
              <thead>
                <tr>
                  <th scope="col">Member code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Status</th>
                  <th scope="col">Registered</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <span className="table-code">{member.memberCode}</span>
                    </td>
                    <td>
                      <Link className="table-link" href={`/members/${member.id}`}>
                        {member.firstName} {member.lastName}
                      </Link>
                    </td>
                    <td>{member.phone}</td>
                    <td>
                      <span className={`badge badge-${member.status.toLowerCase()}`}>
                        {memberStatusLabel(member.status)}
                      </span>
                    </td>
                    <td>{formatDate(member.createdAt)}</td>
                    <td className="table-actions">
                      <Link className="btn btn-ghost" href={`/members/${member.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <nav className="pager" aria-label="Member pages">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || state === 'loading'}
              >
                Previous
              </button>
              <span className="pager-status">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= pageCount || state === 'loading'}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/** A calendar date, so the table does not show a time nobody needs. */
export function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString().slice(0, 10);
}