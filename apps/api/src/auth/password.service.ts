import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

/** bcrypt work factor. 12 is a current default and costs roughly 0.4s per hash. */
export const BCRYPT_ROUNDS = 12;

let timingEqualisationHash: Promise<string>;

/**
 * A real bcrypt digest of a randomly generated string that is never a password.
 *
 * Generated on first use rather than committed as a literal, so its cost factor
 * always matches BCRYPT_ROUNDS. A hardcoded digest would silently drift out of
 * step if the work factor changed, reintroducing the timing difference the
 * dummy comparison exists to remove.
 */
export function getTimingEqualisationHash(): Promise<string> {
  if (timingEqualisationHash === undefined) {
    timingEqualisationHash = bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
  }

  return timingEqualisationHash;
}

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
    await bcrypt.compare(plainText, await getTimingEqualisationHash());
  }
}