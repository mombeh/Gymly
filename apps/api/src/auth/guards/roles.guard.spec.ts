import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { INSUFFICIENT_ROLE_MESSAGE, RolesGuard } from './roles.guard';
import { AUTHENTICATION_REQUIRED_MESSAGE } from '../auth.types';
import { UserRole } from '../../generated/prisma/client';

function createContext(options: {
  roles?: UserRole[];
  handlerRoles?: UserRole[];
}): { context: ExecutionContext; reflector: Reflector } {
  const handler = (): void => undefined;

  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === ROLES_KEY ? options.handlerRoles : undefined,
    ),
  } as unknown as Reflector;

  const request: { user?: { sub: string; email: string; role: UserRole } } = {};

  if (options.roles !== undefined) {
    request.user = { sub: 'user-1', email: 'someone@gymly.test', role: options.roles[0] as UserRole };
  }

  const context = {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('RolesGuard', () => {
  describe('when the caller holds an allowed role', () => {
    it.each([
      ['OWNER', UserRole.OWNER],
      ['RECEPTIONIST', UserRole.RECEPTIONIST],
      ['TRAINER', UserRole.TRAINER],
      ['MEMBER', UserRole.MEMBER],
    ])('admits a %s', (_label, role) => {
      const { context, reflector } = createContext({ roles: [role], handlerRoles: [role] });

      expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
    });

    it('admits a role that is one of several allowed', () => {
      const { context, reflector } = createContext({
        roles: [UserRole.TRAINER],
        handlerRoles: [UserRole.RECEPTIONIST, UserRole.TRAINER],
      });

      expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
    });
  });

  describe('when the caller holds a disallowed role', () => {
    it('refuses with 403 rather than 401, because the caller is authenticated', () => {
      const { context, reflector } = createContext({
        roles: [UserRole.MEMBER],
        handlerRoles: [UserRole.OWNER],
      });

      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(INSUFFICIENT_ROLE_MESSAGE);
    });

    it('does not leak the roles that were allowed', () => {
      const { context, reflector } = createContext({
        roles: [UserRole.MEMBER],
        handlerRoles: [UserRole.OWNER, UserRole.RECEPTIONIST],
      });

      const error = (() => {
        try {
          new RolesGuard(reflector).canActivate(context);
          return null;
        } catch (thrown: unknown) {
          return thrown as Error;
        }
      })();

      expect(error?.message).toBe(INSUFFICIENT_ROLE_MESSAGE);
      expect(error?.message).not.toContain('OWNER');
    });

    it('keeps reception staff out of owner-only administration', () => {
      const { context, reflector } = createContext({
        roles: [UserRole.RECEPTIONIST],
        handlerRoles: [UserRole.OWNER],
      });

      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
    });

    it('keeps trainers out of front-desk work', () => {
      const { context, reflector } = createContext({
        roles: [UserRole.TRAINER],
        handlerRoles: [UserRole.OWNER, UserRole.RECEPTIONIST],
      });

      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('when the caller is unauthenticated', () => {
    it('refuses with 401 when the route declares roles', () => {
      const { context, reflector } = createContext({ handlerRoles: [UserRole.OWNER] });

      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(UnauthorizedException);
      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(AUTHENTICATION_REQUIRED_MESSAGE);
    });

    it('refuses with 401 even when the route declares no roles', () => {
      // Otherwise attaching this guard could quietly make a route public.
      const { context, reflector } = createContext({ handlerRoles: [] });

      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(UnauthorizedException);
    });

    it('refuses with 401 when no requirement was declared at all', () => {
      const { context, reflector } = createContext({});

      expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('when the route declares no role requirement', () => {
    it('admits any authenticated caller', () => {
      const { context, reflector } = createContext({ roles: [UserRole.MEMBER] });

      expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
    });
  });

  describe('metadata lookup', () => {
    it('asks for the namespaced roles key on the handler and the controller', () => {
      const { context, reflector } = createContext({ roles: [UserRole.MEMBER], handlerRoles: [] });
      const getAllAndOverride = jest.fn(() => []);
      reflector.getAllAndOverride = getAllAndOverride as unknown as Reflector['getAllAndOverride'];

      new RolesGuard(reflector).canActivate(context);

      expect(getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        expect.any(Function),
        expect.any(Function),
      ]);
    });
  });
});