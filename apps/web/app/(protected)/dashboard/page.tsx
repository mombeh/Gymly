'use client';

import { useAuth } from '../../../lib/auth-context';

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">
            Welcome{user === null ? '' : `, ${user.firstName}`}
          </h1>
          <p className="dashboard-subtitle">
            {user === null ? '' : `${user.email} · ${user.role.toLowerCase()}`}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Sign out
        </button>
      </header>

      <section className="dashboard-card">
        <h2 className="dashboard-card-title">Your account</h2>
        <dl className="dashboard-details">
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user?.role}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{user?.status}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}