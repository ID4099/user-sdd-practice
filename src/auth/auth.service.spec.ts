import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { RefreshSession } from './refresh-session.entity';

// ─── Mock factories ─────────────────────────────────────────────────────────

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
  signAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, fallback?: unknown) => {
    const map: Record<string, unknown> = {
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return map[key] ?? fallback;
  }),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function activeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    password: '$2b$10$hashedpassword',
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(
      mockUsersRepo as any,
      mockRefreshSessionRepo as any,
      mockJwtService as any,
      mockConfigService as any,
    );
    jest.clearAllMocks();
    mockJwtService.signAsync.mockResolvedValue('signed-jwt-token');
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return token pair when credentials are valid', async () => {
      const user = activeUser();
      mockUsersRepo.findOne.mockResolvedValue(user);

      // Mock bcrypt.compare to return true (valid password)
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

      mockRefreshSessionRepo.create.mockReturnValue({});
      mockRefreshSessionRepo.save.mockResolvedValue({});

      const result = await service.login('admin@example.com', 'plainPassword');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.login('nonexistent@x.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      const user = activeUser();
      mockUsersRepo.findOne.mockResolvedValue(user);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

      await expect(service.login('admin@example.com', 'wrongpass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException when user is deactivated (deletedAt set)', async () => {
      const deactivated = activeUser({ deletedAt: new Date('2024-01-01') });
      mockUsersRepo.findOne.mockResolvedValue(deactivated);

      await expect(service.login('admin@example.com', 'pass')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should return new token pair when refresh token is valid', async () => {
      const session = activeSession();
      const user = activeUser();
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockRefreshSessionRepo.update.mockResolvedValue({});
      mockRefreshSessionRepo.create.mockReturnValue({});
      mockRefreshSessionRepo.save.mockResolvedValue({});

      const result = await service.refresh('user-1', 'plain-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException when no active session is found', async () => {
      mockRefreshSessionRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh('user-1', 'any-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException and revoke session when refresh token is already consumed (reuse-detection)', async () => {
      const consumedSession = activeSession({ consumedAt: new Date() });
      mockRefreshSessionRepo.findOne.mockResolvedValue(consumedSession);

      const revokeSpy = jest
        .spyOn(service, 'revokeAllSessionsForUser')
        .mockResolvedValue(undefined);

      await expect(service.refresh('user-1', 'old-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(revokeSpy).toHaveBeenCalledWith('user-1');
    });

    it('should throw UnauthorizedException when session is revoked', async () => {
      const revokedSession = activeSession({ revokedAt: new Date() });
      mockRefreshSessionRepo.findOne.mockResolvedValue(revokedSession);

      await expect(service.refresh('user-1', 'old-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when session is expired', async () => {
      const expiredSession = activeSession({
        expiresAt: new Date(Date.now() - 1000),
      });
      mockRefreshSessionRepo.findOne.mockResolvedValue(expiredSession);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

      await expect(service.refresh('user-1', 'any-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token hash does not match', async () => {
      const session = activeSession();
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

      await expect(service.refresh('user-1', 'wrong-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should mark session as revoked on logout', async () => {
      const session = activeSession();
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      mockRefreshSessionRepo.update.mockResolvedValue({});

      await service.logout('user-1', 'plain-refresh-token');

      expect(mockRefreshSessionRepo.update).toHaveBeenCalledWith(
        { id: session.id },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('should complete without error when no active session exists (idempotent logout)', async () => {
      mockRefreshSessionRepo.findOne.mockResolvedValue(null);
      // Should not throw
      await expect(service.logout('user-1', 'any-token')).resolves.not.toThrow();
    });
  });

  // ── revokeAllSessionsForUser ───────────────────────────────────────────────

  describe('revokeAllSessionsForUser', () => {
    it('should mark revokedAt on all active sessions for the user', async () => {
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 3 });

      await service.revokeAllSessionsForUser('user-1');

      expect(mockRefreshSessionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('should not throw when user has no active sessions', async () => {
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 0 });
      await expect(service.revokeAllSessionsForUser('user-no-sessions')).resolves.not.toThrow();
    });
  });
});
