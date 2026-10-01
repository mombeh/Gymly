import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/** bcrypt work factor. 12 is a current default and costs roughly 0.4s per hash. */
export const BCRYPT_ROUNDS = 12;

/**
 * A real bcrypt digest of a randomly generated string that is never used as a
 * password. Verifying against it when no user was found makes the "unknown
 * email" path take roughly as long as the "wrong password" path, so response
 * time cannot be used to enumerate registered accounts.
 */
export const TIMING_EQUALISATION_HASH =
  '$2b$12$j6Dv458mbQA7tX3xj7J7YehB/wWtIi6vYmJwxVJWFUQtEgroZND9q';

@Injectable()
export class PasswordService {
  /** Produces a bcrypt digest. The plaintext is never stored or logged. */
  async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, BCRYPT_ROUNDS);
  }

  /**
   * Constant-time comparison against a stored digest. bcrypt.compare derives
   * the key and compares it without an early exit on the first differing byte.
   */
  async verify(plainText: string, digest: string): Promise<boolean> {
    return bcrypt.compare(plainText, digest);
  }

  /**
   * Burns the same amount of time as a real verification. Called when no user
   * matched, so a missing account is not distinguishable by latency.
   */
  async simulateVerification(plainText: string): Promise<void> {
    await bcrypt.compare(plainText, TIMING_EQUALISATION_HASH);
  }
}
