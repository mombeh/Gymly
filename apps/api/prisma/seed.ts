/**
 * Development seed.
 *
 * Registration always creates a MEMBER, which is deliberate: a self-service form
 * that lets a visitor pick their own role is an open door. This script is the
 * operator-side way to create accounts with specific roles, for development and
 * for trying the role-aware UI.
 *
 * Usage:
 *   npm run db:seed                                  create the four demo accounts
 *   npm run db:seed -- --email a@b.c --role OWNER    set one existing account's role
 *
 * Talks to the database through `pg` rather than the generated Prisma client:
 * that client is emitted as TypeScript whose imports carry `.js` specifiers,
 * which the ts-node runner used here does not remap. Only the enum names and
 * the bcrypt cost factor are shared with the app, so neither can drift.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

import { BCRYPT_ROUNDS } from '../src/auth/password.service';
import { UserRole, type UserRole as UserRoleType } from '../src/generated/prisma/enums';

const DEFAULT_SEED_PASSWORD = 'GymlyDev123!';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD;

const DEMO_ACCOUNTS: ReadonlyArray<{
  email: string;
  firstName: string;
  lastName: string;
  role: UserRoleType;
}> = [
  { email: 'owner@gymly.dev', firstName: 'Ada', lastName: 'Otieno', role: UserRole.OWNER },
  { email: 'reception@gymly.dev', firstName: 'Rae', lastName: 'Achieng', role: UserRole.RECEPTIONIST },
  { email: 'trainer@gymly.dev', firstName: 'Kai', lastName: 'Mwangi', role: UserRole.TRAINER },
  { email: 'member@gymly.dev', firstName: 'Sue', lastName: 'Njeri', role: UserRole.MEMBER },
];

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline !== undefined) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);

  return index === -1 ? undefined : process.argv[index + 1];
}

function isUserRole(value: string): value is UserRoleType {
  return Object.values<string>(UserRole).includes(value);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }

  const connectionString = process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString.trim() === '') {
    throw new Error('DATABASE_URL is not set. Run this from apps/api so .env is loaded.');
  }

  const pool = new Pool({ connectionString });

  try {
    const email = readFlag('email');
    const role = readFlag('role');

    if (email !== undefined || role !== undefined) {
      await setRole(pool, email, role);
    } else {
      await createDemoAccounts(pool);
    }
  } finally {
    await pool.end();
  }
}

async function setRole(
  pool: Pool,
  email: string | undefined,
  role: string | undefined,
): Promise<void> {
  if (email === undefined || role === undefined) {
    throw new Error('Give both --email and --role, for example: --email a@b.c --role OWNER');
  }

  if (!isUserRole(role)) {
    throw new Error(`Unknown role "${role}". Expected one of: ${Object.values(UserRole).join(', ')}.`);
  }

  const trimmed = email.trim();
  // Matched case-insensitively, the same way AuthService looks an account up.
  const result = await pool.query<{ email: string }>(
    'UPDATE users SET role = $2::"UserRole", status = $3::"UserStatus", updated_at = now() WHERE lower(email) = lower($1) RETURNING email',
    [trimmed, role, 'ACTIVE'],
  );

  const updated = result.rows[0];

  if (updated === undefined) {
    throw new Error(`No account with the email ${trimmed}. Register it first, then run this again.`);
  }

  console.log(`Set ${updated.email} to ${role}.`);
  console.log('Sign out and sign in again: the role lives in the access token until it expires.');
}

async function createDemoAccounts(pool: Pool): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  console.log(`Seeding demo accounts. Password for all four: ${SEED_PASSWORD}`);
  console.log('');

  for (const account of DEMO_ACCOUNTS) {
    // ON CONFLICT keeps the script re-runnable and repairs a half-created account.
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::"UserRole", $6::"UserStatus", now(), now())
       ON CONFLICT (lower(email)) DO UPDATE
         SET role = EXCLUDED.role,
             status = EXCLUDED.status,
             password_hash = EXCLUDED.password_hash,
             updated_at = now()`,
      [account.firstName, account.lastName, account.email, passwordHash, account.role, 'ACTIVE'],
    );

    console.log(`  ${account.role.padEnd(13)} ${account.email}`);
  }

  console.log('');
  console.log('All four accounts are ACTIVE, so each can sign in and see its own navigation.');
  console.log('Sign in as owner@gymly.dev to see the full administrative sidebar.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
