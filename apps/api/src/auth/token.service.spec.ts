import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

const SECRET = 'unit-test-signing-key-that-is-long-enough';
const OTHER_SECRET = 'a-completely-different-signing-key-32-chars';

function createConfigService(jwtExpiresIn: string): ConfigService {
  return {
    getOrThrow: () => ({ auth: { jwtSecret: SECRET, jwtExpiresIn } }),
  } as unknown as ConfigService;
}

/** Mirrors the options registered in AuthModule. */
function createJwtService(overrides: Record<string, unknown> = {}): JwtService {
  return new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256', expiresIn: '15m' },
    verifyOptions: { algorithms: ['HS256'] },
    ...overrides,
  });
}

function createService(jwtExpiresIn = '15m'): TokenService {
  return new TokenService(createJwtService(), createConfigService(jwtExpiresIn));
}

const user = { id: 'e1f2a3b4-0000-4000-8000-000000000001', email: 'ada@gymly.test', role: 'OWNER' as const };

describe('TokenService', () => {
  describe('issue and verify', () => {
    it('round-trips the identity claims', async () => {
      const service = createService();
      const token = await service.issue(user);

      const payload = await service.verify(token);

      expect(payload.sub).toBe(user.id);
      expect(payload.email).toBe(user.email);
      expect(payload.role).toBe(user.role);
    });

    it('never embeds the password hash', async () => {
      const token = await createService().issue(user);

      expect(token.split('.')).toHaveLength(3);
      const claims: unknown = JSON.parse(
        Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
      );

      expect(claims).toEqual({
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: expect.any(Number),
        exp: expect.any(Number),
      });
    });
  });

  describe('verify rejects', () => {
    it('a token whose payload was tampered with', async () => {
      const service = createService();
      const token = await service.issue(user);
      const [header, payload, signature] = token.split('.');
      const decoded: unknown = JSON.parse(
        Buffer.from(payload ?? '', 'base64url').toString('utf8'),
      );
      const escalated = Buffer.from(
        JSON.stringify({ ...(decoded as object), role: 'OWNER', sub: 'someone-else' }),
      ).toString('base64url');

      await expect(service.verify(`${header}.${escalated}.${signature}`)).rejects.toThrow();
    });

    it('a token signed with a different secret', async () => {
      const foreign = new JwtService({ secret: OTHER_SECRET });
      const token = await foreign.signAsync({ sub: user.id, email: user.email, role: user.role });

      await expect(createService().verify(token)).rejects.toThrow();
    });

    it('an expired token', async () => {
      const expired = new JwtService({
        secret: SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: '-1s' },
      });
      const token = await expired.signAsync({ sub: user.id, email: user.email, role: user.role });

      await expect(createService().verify(token)).rejects.toThrow(/expired/i);
    });

    it('a token signed with a different algorithm, despite a valid signature', async () => {
      const service = createService();
      // Same secret, but HS512 instead of the pinned HS256.
      const hs512 = new JwtService({
        secret: SECRET,
        signOptions: { algorithm: 'HS512', expiresIn: '15m' },
      });
      const token = await hs512.signAsync({ sub: user.id, email: user.email, role: user.role });

      await expect(service.verify(token)).rejects.toThrow();
    });

    it('a malformed token', async () => {
      await expect(createService().verify('not.a.jwt')).rejects.toThrow();
    });
  });

  describe('expiresInSeconds', () => {
    it.each([
      ['15m', 900],
      ['1h', 3600],
      ['7d', 604800],
      ['45s', 45],
      ['120', 120],
    ])('resolves %s to %i seconds', (configured, expected) => {
      expect(createService(configured).expiresInSeconds).toBe(expected);
    });
  });
});
