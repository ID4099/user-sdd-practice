/**
 * Integration tests for JwtStrategy and AuthService reuse-detection.
 *
 * These tests use @nestjs/testing to wire the real NestJS DI graph —
 * real service/strategy instances — while substituting TypeORM
 * repositories with in-memory mocks.
 *
 * Spec coverage:
 *  - user-auth: "Refresh token ya consumido (detección de reutilización)"
 *    → the system MUST revoke the active session AND return 401
 *  - rbac-enforcement: "Revocación inmediata"
 *    → JwtStrategy MUST reject a valid JWT whose owner has deletedAt set
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { RefreshSession } from './refresh-session.entity';
import { JwtPayload } from './jwt.strategy';

// ─── Mock repository factories ───────────────────────────────────────────────

const mockUsersRepo = {
  findOne: jest.fn(),
};

const mockRefreshSessionRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildActiveUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-int-1',
    email: 'admin@int.test',
    password: '$2b$10$hash',
    deletedAt: null,
    role: { name: 'ADMIN_ROOT' } as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function buildActiveSession(overrides: Partial<RefreshSession> = {}): RefreshSession {
  return {
    id: 'sess-int-1',
    userId: 'user-int-1',
    tokenHash: '$2b$10$hashedtoken',
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    consumedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as RefreshSession;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Integration — JwtStrategy & AuthService reuse-detection', () => {
  let module: TestingModule;
  let jwtStrategy: JwtStrategy;
  let authService: AuthService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-integration-secret',
              JWT_ACCESS_EXPIRES_IN: '15m',
            }),
          ],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            secret: config.get<string>('JWT_SECRET', 'test-integration-secret'),
            signOptions: { expiresIn: '15m' },
          }),
        }),
      ],
      providers: [
        AuthService,
        JwtStrategy,
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepo,
        },
        {
          provide: getRepositoryToken(RefreshSession),
          useValue: mockRefreshSessionRepo,
        },
      ],
    }).compile();

    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ── JwtStrategy: rejects user with deletedAt set ──────────────────────────

  describe('JwtStrategy.validate — immediate revocation on deactivation', () => {
    it('should return the user object when the token payload maps to an active user', async () => {
      const user = buildActiveUser();
      mockUsersRepo.findOne.mockResolvedValue(user);

      const payload: JwtPayload = {
        sub: 'user-int-1',
        email: 'admin@int.test',
        role: 'ADMIN_ROOT',
      };

      const result = await jwtStrategy.validate(payload);

      expect(result.id).toBe('user-int-1');
      expect(result.deletedAt).toBeNull();
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-int-1' },
        withDeleted: true,
      });
    });

    it('should throw UnauthorizedException when the user associated with the token has deletedAt populated', async () => {
      // Simulates an admin who deactivated a user — their existing valid JWT
      // must be rejected at the strategy level without any DB session check.
      const deactivatedUser = buildActiveUser({
        id: 'deactivated-user',
        deletedAt: new Date('2026-06-01T12:00:00Z'),
      });
      mockUsersRepo.findOne.mockResolvedValue(deactivatedUser);

      const payload: JwtPayload = {
        sub: 'deactivated-user',
        email: 'deactivated@int.test',
        role: 'ADMIN_ROOT',
      };

      await expect(jwtStrategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when the sub in the payload does not exist in the database', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      const payload: JwtPayload = {
        sub: 'phantom-user',
        email: 'ghost@int.test',
        role: 'ADMIN_ROOT',
      };

      await expect(jwtStrategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── AuthService.refresh: reuse-detection path (DI-wired) ─────────────────

  describe('AuthService.refresh — reuse-detection (integration-wired)', () => {
    it('should throw UnauthorizedException and invoke revokeAllSessionsForUser when token is already consumed', async () => {
      const consumedSession = buildActiveSession({ consumedAt: new Date() });
      mockRefreshSessionRepo.findOne.mockResolvedValue(consumedSession);

      // revokeAllSessionsForUser calls repo.update — set up the mock
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 1 });

      await expect(authService.refresh('user-int-1', 'stale-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // The update call for revocation must target user-int-1 with revokedAt
      expect(mockRefreshSessionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-int-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('should NOT revoke sessions when the session exists and is NOT consumed', async () => {
      // Simulate hash mismatch (wrong token) — no revocation should occur
      const session = buildActiveSession();
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

      await expect(authService.refresh('user-int-1', 'wrong-hash')).rejects.toThrow(
        UnauthorizedException,
      );

      // update should NOT be called — this is a hash mismatch, not reuse
      expect(mockRefreshSessionRepo.update).not.toHaveBeenCalled();
    });

    it('should emit a new token pair when the session is valid and the hash matches', async () => {
      const session = buildActiveSession();
      const user = buildActiveUser();
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 1 });
      mockRefreshSessionRepo.create.mockReturnValue({});
      mockRefreshSessionRepo.save.mockResolvedValue({});

      const result = await authService.refresh('user-int-1', 'valid-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    });
  });
});
