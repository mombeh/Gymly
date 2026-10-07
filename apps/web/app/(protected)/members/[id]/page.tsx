'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { readToken } from '../../../../lib/auth-storage';
import {
  deactivateMember,
  describeMemberError,
  getMember,
} from '../../../../lib/members-api';
import {
  UPCOMING_SECTIONS,
  genderLabel,
  memberStatusLabel,
  type Gender,
  type Member,
} from '../../../../lib/member-types';
import { formatDate } from '../../../../components/members/members-list';

type LoadState = 'loading' | 'ready' | 'error';

export default function MemberDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const [member, setMember] = useState<Member | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (id: string, signal: AbortSignal) => {
    const token = readToken();

    if (token === null) {
      setState('error');
      setError('Your session has ended. Sign in again to view this member.');

      return;
    }

    setState('loading');
    setError(null);

    try {
      const result = await getMember(id, token, signal);

      setMember(result);
      setState('ready');
    } catch (caught) {
      if (signal.aborted) return;

      setState('error');
      setError(describeMemberError(caught, 'load'));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const { id } = await params;

      await load(id, controller.signal);
    })();

    return () => controller.abort();
  }, [params, load, reload]);

  async function handleDeactivate() {
    if (member === null || isDeactivating) return;

    const token = readToken();

    if (token === null) {
      setActionError('Your session has ended. Sign in again to continue.');

      return;
    }

    setIsDeactivating(true);
    setActionError(null);

    try {
      const updated = await deactivateMember(member.id, token);

      // The record comes back with the new status, so the page reflects the
      // change without a second request and cannot show a stale "Active".
      setMember(updated);
      setIsConfirming(false);
      setIsDeactivating(false);
    } catch (caught) {
      setActionError(describeMemberError(caught, 'update'));
      setIsDeactivating(false);
    }
  }

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/members">Members</Link>
        <span aria-hidden="true">/</span>
        <span>{member?.memberCode ?? 'Member'}</span>
      </nav>

      {state === 'loading' && (
        <p className="state-message" role="status" aria-live="polite">
          Loading member…
        </p>
      )}

      {state === 'error' && error !== null && (
        <div className="state-message state-error" role="alert">
          <p>{error}</p>
          <Link className="btn btn-ghost" href="/members">
            Back to members
          </Link>
        </div>
      )}

      {state === 'ready' && member !== null && (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">
                {member.firstName} {member.lastName}
              </h1>
              <p className="page-note">
                Member code <strong>{member.memberCode}</strong>, registered on{' '}
                {formatDate(member.createdAt)}.
              </p>
            </div>

            <div className="header-actions">
              <Link className="btn btn-secondary" href={`/members/${member.id}/edit`}>
                Edit member
              </Link>

              {member.status !== 'INACTIVE' && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsConfirming(true)}
                  disabled={isDeactivating}
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>

          {actionError !== null && (
            <p className="form-error-banner" role="alert">
              {actionError}
            </p>
          )}

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Profile</h2>
              <span className={`badge badge-${member.status.toLowerCase()}`}>
                {memberStatusLabel(member.status)}
              </span>
            </div>

            <dl className="detail-list">
              <Detail term="First name" value={member.firstName} />
              <Detail term="Last name" value={member.lastName} />
              <Detail term="Phone" value={member.phone} />
              <Detail term="Email" value={member.email ?? 'Not provided'} muted={member.email === null} />
              <Detail
                term="Date of birth"
                value={member.dateOfBirth ?? 'Not provided'}
                muted={member.dateOfBirth === null}
              />
              <Detail
                term="Gender"
                value={member.gender === null ? 'Not stated' : genderLabel(member.gender as Gender)}
                muted={member.gender === null}
              />
              <Detail term="Address" value={member.address ?? 'Not provided'} muted={member.address === null} />
              <Detail
                term="Emergency contact"
                value={member.emergencyContact ?? 'Not provided'}
                muted={member.emergencyContact === null}
              />
              <Detail term="Registered" value={formatDate(member.createdAt)} />
              <Detail term="Last updated" value={formatDate(member.updatedAt)} />
            </dl>
          </section>

          {/*
            These three sections are placeholders by design. The memberships,
            payments and attendance APIs do not exist yet, so there is nothing
            real to show. Inventing rows here would be indistinguishable from
            real history while someone is building against it.
          */}
          {UPCOMING_SECTIONS.map((section) => (
            <section className="card" key={section.key}>
              <h2 className="card-title">{section.title}</h2>
              <p className="card-note">{section.description}</p>
            </section>
          ))}

          {isConfirming && (
            <div className="modal-backdrop" role="presentation" onClick={() => setIsConfirming(false)}>
              <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="deactivate-title"
                aria-describedby="deactivate-description"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className="card-title" id="deactivate-title">
                  Deactivate {member.firstName} {member.lastName}?
                </h2>
                <p className="card-note" id="deactivate-description">
                  The member record is kept, and their past payments and attendance remain
                  traceable. They will no longer be listed as an active member.
                </p>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleDeactivate}
                    disabled={isDeactivating}
                  >
                    {isDeactivating ? 'Deactivating…' : 'Deactivate member'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsConfirming(false)}
                    disabled={isDeactivating}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One label/value pair. "Not provided" is dimmed so it reads as absent. */
function Detail({
  term,
  value,
  muted = false,
}: {
  term: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="detail">
      <dt className="detail-term">{term}</dt>
      <dd className={muted ? 'detail-value detail-muted' : 'detail-value'}>{value}</dd>
    </div>
  );
}