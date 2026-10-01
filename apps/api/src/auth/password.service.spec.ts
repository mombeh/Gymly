import { BCRYPT_ROUNDS, PasswordService, TIMING_EQUALISATION_HASH } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const plainText = 'correct-horse-battery-staple';

  describe('hash', () => {
    it('returns a bcrypt digest and never the plaintext', async () => {
      const digest = await service.hash(plainText);

      expect(digest).not.toBe(plainText);
      expect(digest).not.toContain(plainText);
      expect(digest).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('uses the configured work factor', async () => {
      const digest = await service.hash(plainText);

      expect(digest).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_ROUNDS}\\$`));
    });

    it('salts each digest, so the same password hashes differently', async () => {
      const first = await service.hash(plainText);
      const second = await service.hash(plainText);

      expect(first).not.toBe(second);
      await expect(service.verify(plainText, first)).resolves.toBe(true);
      await expect(service.verify(plainText, second)).resolves.toBe(true);
    });
  });

  describe('verify', () => {
    it('accepts the correct password', async () => {
      const digest = await service.hash(plainText);

      await expect(service.verify(plainText, digest)).resolves.toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const digest = await service.hash(plainText);

      await expect(service.verify('wrong-password', digest)).resolves.toBe(false);
    });

    it('rejects a malformed stored digest instead of throwing', async () => {
      await expect(service.verify(plainText, 'not-a-bcrypt-digest')).resolves.toBe(false);
    });
  });

  describe('simulateVerification', () => {
    it('resolves without throwing so an unknown account can be timed', async () => {
      await expect(service.simulateVerification(plainText)).resolves.toBeUndefined();
    });

    it('never matches, so it cannot stand in for a real account', async () => {
      await expect(service.verify(plainText, TIMING_EQUALISATION_HASH)).resolves.toBe(false);
    });
  });
});
