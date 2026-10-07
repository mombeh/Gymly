'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MemberForm } from '../../../../components/members/member-form';
import { readToken } from '../../../../lib/auth-storage';
import { createMember, describeMemberError } from '../../../../lib/members-api';
import type { MemberFormValues } from '../../../../lib/member-validation';


export default function NewMemberPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(values: MemberFormValues) {
    // Guards a double submit: the button is disabled too, but a form can still be
    // submitted with Enter while the first request is in flight, which would
    // register the same person twice.
    if (isSubmitting) return;

    const token = readToken();

    if (token === null) {
      setFormError('Your session has ended. Sign in again to register a member.');

      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const member = await createMember(
        {
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone,
          email: values.email,
          dateOfBirth: values.dateOfBirth,
          gender: values.gender === '' ? undefined : values.gender,
          address: values.address,
          emergencyContact: values.emergencyContact,
        },
        token,
      );

      // Straight to the record that was just created, which is where reception
      // needs to be next: to check the details and attach a membership later.
      router.replace(`/members/${member.id}`);
    } catch (error) {
      setFormError(describeMemberError(error, 'create'));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/members">Members</Link>
        <span aria-hidden="true">/</span>
        <span>Register</span>
      </nav>

      <h1 className="page-title">Register a member</h1>
      <p className="page-note">
        A member code is issued by the gym automatically. Only a name and a phone number are
        needed to register someone; everything else can be added later.
      </p>

      {formError !== null && (
        <p className="form-error-banner" role="alert">
          {formError}
        </p>
      )}

      <MemberForm
        submitLabel="Register member"
        busyLabel="Registering…"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}