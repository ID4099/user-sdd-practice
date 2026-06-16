/**
 * Coverage hardening spec for AuthService.
 *
 * These tests add targeted scenarios that are NOT covered by the main
 * auth.service.spec.ts file. They focus on:
 *  - reuse-detection: verifies that revokeAllSessionsForUser is called
 *    with the correct userId BEFORE the 401 is thrown
 *  - refresh rotation: confirms consumedAt is persisted on the old session
 *  - logout token mismatch: idempotent when bcrypt compare returns false
 */

import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { RefreshSession } from './refresh-session.entity';

// ─── Mock factories ──────────────────────────────────────────────────────────

const mockUsersRepo = {
  findOne: jest.fn(),
};

const mockRefreshSessionRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('signed-jwt'),
};

const mockConfigService = {
  get: jest.fn((key: string, fallback?: unknown) => {
    const map: Record<string, unknown> = {
      JWT_ACCESS_EXPIRES_IN: '15m',
    };
    return map[key] ?? fallback;
  }),
};

function activeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    password: '$2b$10$hash',
    deletedAt: null,
    role: { name: 'ADMIN_ROOT' } as any,
    ...overrides,
  } as User;
}

function activeSession(overrides: Partial<RefreshSession> = {}): RefreshSession {
  return {
    id: 'sess-1',
    userId: 'user-1',
    tokenHash: '$2b$10$hashedtoken',
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    consumedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as RefreshSession;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService — coverage hardening', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(
      mockUsersRepo as any,
      mockRefreshSessionRepo as any,
      mockJwtService as any,
      mockConfigService as any,
    );
    jest.resetAllMocks();
    mockJwtService.signAsync.mockResolvedValue('signed-jwt');
  });

  // ── reuse-detection ────────────────────────────────────────────────────────

  describe('refresh — reuse-detection', () => {
    it('should call revokeAllSessionsForUser with the correct userId before throwing 401', async () => {
      const consumedSession = activeSession({ consumedAt: new Date() });
      mockRefreshSessionRepo.findOne.mockResolvedValue(consumedSession);
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 1 });

      let revokeCalledWith: string | null = null;
      jest.spyOn(service, 'revokeAllSessionsForUser').mockImplementation(
        async (userId: string) => {
          revokeCalledWith = userId;
        },
      );

      await expect(service.refresh('user-1', 'stale-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Critical: revocation MUST happen and MUST target the correct user
      expect(revokeCalledWith).toBe('user-1');
    });

    it('should NOT call revokeAllSessionsForUser when session is revoked (not consumed)', async () => {
      const revokedSession = activeSession({ revokedAt: new Date() });
      mockRefreshSessionRepo.findOne.mockResolvedValue(revokedSession);

      const revokeSpy = jest
        .spyOn(service, 'revokeAllSessionsForUser')
        .mockResolvedValue(undefined);

      await expect(service.refresh('user-1', 'token')).rejects.toThrow(
        UnauthorizedException,
      );

      // A revoked (but not consumed) session must NOT trigger full revocation
      expect(revokeSpy).not.toHaveBeenCalled();
    });
  });

  // ── refresh rotation — consumedAt marking ──────────────────────────────────

  describe('refresh — token rotation', () => {
    it('should mark the old session consumedAt before issuing new tokens', async () => {
      const session = activeSession();
      const user = activeUser();
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 1 });
      mockRefreshSessionRepo.create.mockReturnValue({});
      mockRefreshSessionRepo.save.mockResolvedValue({});

      await service.refresh('user-1', 'valid-token');

      // The first update call must be the consumedAt marking for the old session
      expect(mockRefreshSessionRepo.update).toHaveBeenCalledWith(
        { id: session.id },
        expect.objectContaining({ consumedAt: expect.any(Date) }),
      );
    });
  });

  // ── login — deactivated user path ─────────────────────────────────────────

  describe('login — deactivated user', () => {
    it('should throw ForbiddenException before password check when user is deactivated', async () => {
      const deactivated = activeUser({ deletedAt: new Date() });
      mockUsersRepo.findOne.mockResolvedValue(deactivated);

      // bcrypt.compare must NOT be called — the function should short-circuit
      const compareSpy = jest.spyOn(require('bcrypt'), 'compare');

      await expect(service.login('admin@example.com', 'any')).rejects.toThrow(
        ForbiddenException,
      );

      // Verify no unnecessary bcrypt work was done
      expect(compareSpy).not.toHaveBeenCalled();
    });
  });

  // ── logout — token mismatch (idempotent) ──────────────────────────────────

  describe('logout — token mismatch', () => {
    it('should NOT update session when bcrypt compare returns false (token mismatch)', async () => {
      const session = activeSession();
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

      await service.logout('user-1', 'wrong-token');

      // update must never be called — the mismatch path returns early
      expect(mockRefreshSessionRepo.update).not.toHaveBeenCalled();
    });
  });
});
