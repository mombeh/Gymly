'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { MemberForm } from '../../../../../components/members/member-form';
import { readToken } from '../../../../../lib/auth-storage';
import { describeMemberError, getMember, updateMember } from '../../../../../lib/members-api';
import type { MemberFormValues } from '../../../../../lib/member-validation';
import type { Member } from '../../../../../lib/member-types';

type LoadState = 'loading' | 'ready' | 'error';

export default function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reload, setReload] = useState(0);

  const load = useCallback(async (id: string, signal: AbortSignal) => {
    const token = readToken();

    if (token === null) {
      setState('error');
      setLoadError('Your session has ended. Sign in again to edit this member.');

      return;
    }

    setState('loading');
    setLoadError(null);

    try {
      const result = await getMember(id, token, signal);

      setMember(result);
      setState('ready');
    } catch (caught) {
      if (signal.aborted) return;

      setState('error');
      setLoadError(describeMemberError(caught, 'load'));
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

  async function handleSubmit(values: MemberFormValues) {
    if (member === null || isSubmitting) return;

    const token = readToken();

    if (token === null) {
      setFormError('Your session has ended. Sign in again to save.');

      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const updated = await updateMember(
        member.id,
        {
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone,
          email: values.email,
          dateOfBirth: values.dateOfBirth,
          gender: values.gender,
          address: values.address,
          emergencyContact: values.emergencyContact,
        },
        token,
      );

      setMember(updated);
      setIsSubmitting(false);
      // Back to the record so the saved result is visible, not just implied.
      router.replace(`/members/${updated.id}`);
    } catch (error) {
      setFormError(describeMemberError(error, 'update'));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/members">Members</Link>
        <span aria-hidden="true">/</span>
        {member !== null && (
          <>
            <Link href={`/members/${member.id}`}>{member.memberCode}</Link>
            <span aria-hidden="true">/</span>
          </>
        )}
        <span>Edit</span>
      </nav>

      <h1 className="page-title">Edit member</h1>

      {state === 'loading' && (
        <p className="state-message" role="status" aria-live="polite">
          Loading member…
        </p>
      )}

      {state === 'error' && loadError !== null && (
        <div className="state-message state-error" role="alert">
          <p>{loadError}</p>
          <Link className="btn btn-ghost" href="/members">
            Back to members
          </Link>
        </div>
      )}

      {state === 'ready' && member !== null && (
        <>
          {formError !== null && (
            <p className="form-error-banner" role="alert">
              {formError}
            </p>
          )}

          <MemberForm
            member={member}
            submitLabel="Save changes"
            busyLabel="Saving…"
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/members/${member.id}`)}
          />
        </>
      )}
    </div>
  );
}