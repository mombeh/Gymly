import { redirect } from 'next/navigation';

/**
 * Single entry point. Everything lives behind the session gate, so an
 * unauthenticated visitor ends up on /login with their destination preserved.
 */
export default function HomePage() {
  redirect('/dashboard');
}