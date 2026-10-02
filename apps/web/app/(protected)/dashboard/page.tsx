'use client';

import { useAuth } from '../../../lib/auth-context';
import { visibleNavItems } from '../../../lib/nav-items';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user === null) return null;

  return (
    <div className="page">
      <h1 className="page-title">Welcome, {user.firstName}</h1>
      <p className="page-note">
        This is your dashboard. It will show gym summary figures once the reporting API is in
        place. Nothing is shown here yet rather than filled with placeholder numbers.
      </p>

      <section className="page-section">
        <h2 className="page-section-title">Your sections</h2>
        <ul className="page-link-list">
          {visibleNavItems(user.role)
            .filter((item) => item.key !== 'dashboard')
            .map((item) => (
              <li key={item.key}>{item.label}</li>
            ))}
        </ul>
      </section>
    </div>
  );
}
