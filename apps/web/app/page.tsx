import Link from 'next/link';

import { ContinueIfAuthenticated } from '../components/landing/continue-if-authenticated';
import {
  CalendarIcon,
  CardIcon,
  ClipboardIcon,
  DumbbellIcon,
  KettlebellArt,
  LogoMark,
  MatArt,
  RackArt,
  ShieldIcon,
  UsersIcon,
} from '../components/landing/illustrations';

const FEATURES = [
  {
    icon: UsersIcon,
    title: 'Member management',
    body: 'Every profile, plan and status in one place, from first signup to renewal.',
  },
  {
    icon: CardIcon,
    title: 'Payment recording',
    body: 'Take a payment at the desk and keep the ledger straight without a spreadsheet.',
  },
  {
    icon: CalendarIcon,
    title: 'Scheduling',
    body: 'Classes and slots that trainers and members can both see at a glance.',
  },
  {
    icon: ClipboardIcon,
    title: 'Attendance',
    body: 'Check members in at the door and keep a reliable record of who trained.',
  },
  {
    icon: DumbbellIcon,
    title: 'Training programmes',
    body: 'Plans and progress for the members each trainer works with.',
  },
  {
    icon: ShieldIcon,
    title: 'Role-based access',
    body: 'Owners, reception staff, trainers and members each see exactly what they should.',
  },
] as const;

export default function LandingPage() {
  return (
    <div className="landing">
      <ContinueIfAuthenticated />

      <nav className="landing-nav">
        <span className="landing-brand">
          <LogoMark />
          Gymly
        </span>
        <div className="landing-nav-actions">
          <Link className="btn btn-secondary" href="/login">
            Sign in
          </Link>
          <Link className="btn btn-primary" href="/register">
            Create account
          </Link>
        </div>
      </nav>

      <header className="hero">
        <div>
          <span className="hero-eyebrow">Gym management, sorted</span>
          <h1 className="hero-title">
            Run your gym.
            <br />
            Not your <em>spreadsheets</em>.
          </h1>
          <p className="hero-lede">
            Members, payments, timetables and check-ins in one calm place. Gymly gives your
            team the tools to run the floor without chasing paperwork.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/register">
              Get started free
            </Link>
            <Link className="btn btn-secondary" href="/login">
              I already have an account
            </Link>
          </div>
          <p className="hero-note">No card required. Set up in a couple of minutes.</p>
        </div>

        <div className="hero-art" aria-hidden="true">
          <RackArt />
          <KettlebellArt />
          <MatArt />
        </div>
      </header>

      <section className="features">
        <div className="features-inner">
          <h2 className="section-title">Everything behind the counter</h2>
          <p className="section-lede">
            The day-to-day work of a gym, covered by the tools your staff actually use.
          </p>

          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="feature-card">
                <span className="feature-icon">
                  <feature.icon />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Ready to get your gym on track?</h2>
        <p>Create an account and start organising your floor today. You can invite your team
          once you are in.</p>
        <div className="hero-actions hero-actions-center">
          <Link className="btn btn-primary" href="/register">
            Create your account
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Gymly — built for gyms that want less admin.</span>
      </footer>
    </div>
  );
}