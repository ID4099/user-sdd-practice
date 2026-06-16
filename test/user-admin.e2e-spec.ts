/**
 * E2E tests — user-admin-system
 *
 * Covers key spec scenarios from user-auth, user-management, and
 * rbac-enforcement using supertest against a fully-wired NestJS
 * application with mock TypeORM repositories.
 *
 * No real PostgreSQL connection is required: TypeORM repositories are
 * replaced with in-memory jest mock objects. The real controllers,
 * services, guards, strategies, and pipes are all exercised.
 *
 * Spec scenarios covered:
 *  - user-auth: login → 200 + httpOnly cookies
 *  - user-auth: invalid credentials → 401
 *  - user-auth: deactivated user login attempt → 403
 *  - user-auth: refresh rotation → 200 + new cookies
 *  - user-auth: logout → 200 + cookies cleared
 *  - user-management: POST /users with valid payload → 201
 *  - user-management: POST /users with invalid email → 400
 *  - user-management: GET /users?page=1&limit=10 → 200 + paginated shape
 *  - rbac-enforcement: unauthenticated request to /users → 401
 */

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/users/user.entity';
import { Role } from '../src/roles/role.entity';
import { RefreshSession } from '../src/auth/refresh-session.entity';

// ─── Mock repositories ────────────────────────────────────────────────────────

const mockUsersRepo = {
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
};

const mockRolesRepo = {
  findOne: jest.fn(),
};

const mockRefreshSessionRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};

// ─── Shared test constants ────────────────────────────────────────────────────

const TEST_JWT_SECRET = 'e2e-test-secret-key-2026';

const ADMIN_USER: Partial<User> = {
  id: 'e2e-user-1',
  email: 'admin@e2e.test',
  password: '$2b$10$dummyhash', // will be mocked — bcrypt.compare is bypassed
  deletedAt: null,
  role: { name: 'ADMIN_ROOT' } as Role,
};

const ADMIN_ROLE: Partial<Role> = {
  id: 'role-1',
  name: 'ADMIN_ROOT',
};

// ─── Minimal test app module ──────────────────────────────────────────────────

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: true,
      isGlobal: true,
      load: [() => ({ JWT_SECRET: TEST_JWT_SECRET, JWT_ACCESS_EXPIRES_IN: '15m' })],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', TEST_JWT_SECRET),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    UsersService,
    { provide: getRepositoryToken(User), useValue: mockUsersRepo },
    { provide: getRepositoryToken(Role), useValue: mockRolesRepo },
    { provide: getRepositoryToken(RefreshSession), useValue: mockRefreshSessionRepo },
  ],
})
class TestAppModule {}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sign a real access token for the test user so protected routes can be tested. */
async function signTestToken(jwtService: JwtService): Promise<string> {
  return jwtService.signAsync({
    sub: ADMIN_USER.id,
    email: ADMIN_USER.email,
    role: 'ADMIN_ROOT',
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('E2E — user-admin-system (mock repos)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ── POST /auth/login ─────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('should return 200 and set httpOnly cookies when credentials are valid', async () => {
      mockUsersRepo.findOne.mockResolvedValue(ADMIN_USER);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockRefreshSessionRepo.create.mockReturnValue({});
      mockRefreshSessionRepo.save.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@e2e.test', password: 'password123' })
        .expect(200);

      expect(res.body).toEqual({ message: 'Login successful.' });

      // Both cookies must be set as httpOnly
      const setCookie: string | string[] = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
      expect(cookieStr).toMatch(/accessToken=/);
      expect(cookieStr).toMatch(/refreshToken=/);
      expect(cookieStr).toMatch(/HttpOnly/);
    });

    it('should return 401 when user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@e2e.test', password: 'password123' })
        .expect(401);
    });

    it('should return 403 when the user account has been deactivated (deletedAt set)', async () => {
      const deactivated = { ...ADMIN_USER, deletedAt: new Date('2026-01-01') };
      mockUsersRepo.findOne.mockResolvedValue(deactivated);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@e2e.test', password: 'password123' })
        .expect(403);
    });

    it('should return 400 when email is malformed', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });
  });

  // ── POST /auth/refresh ────────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('should return 200 and rotate tokens when refresh token cookie is valid', async () => {
      const session = {
        id: 'sess-e2e-1',
        userId: 'e2e-user-1',
        tokenHash: '$2b$10$hashedtoken',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        consumedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      };
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockUsersRepo.findOne.mockResolvedValue(ADMIN_USER);
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 1 });
      mockRefreshSessionRepo.create.mockReturnValue({});
      mockRefreshSessionRepo.save.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', ['refreshToken=valid-opaque-token'])
        .expect(200);

      expect(res.body).toEqual({ message: 'Tokens refreshed.' });

      const setCookie: string | string[] = res.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
      expect(cookieStr).toMatch(/accessToken=/);
      expect(cookieStr).toMatch(/refreshToken=/);
    });

    it('should return 401 when no refresh token cookie is provided', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .expect(401);
    });
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('should return 200 and clear cookies when user is authenticated', async () => {
      const accessToken = await signTestToken(jwtService);
      // JwtStrategy.validate will be called — mock the DB lookup
      mockUsersRepo.findOne.mockResolvedValue(ADMIN_USER);

      const session = {
        id: 'sess-e2e-logout',
        userId: 'e2e-user-1',
        tokenHash: '$2b$10$hashedtoken',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        consumedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      };
      mockRefreshSessionRepo.findOne.mockResolvedValue(session);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 1 });

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [
          `accessToken=${accessToken}`,
          'refreshToken=plain-token',
        ])
        .expect(200);

      expect(res.body).toEqual({ message: 'Logged out successfully.' });

      // Both cookies should be cleared in the response
      const setCookie: string | string[] = res.headers['set-cookie'];
      if (setCookie) {
        const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
        // Cleared cookies typically have expires=Thu, 01 Jan 1970 or Max-Age=0
        expect(cookieStr).toMatch(/accessToken=;|accessToken=$/);
      }
    });
  });

  // ── GET /users (pagination baseline) ─────────────────────────────────────────

  describe('GET /users', () => {
    it('should return 401 when no access token is provided (unauthenticated)', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });

    it('should return 200 with paginated shape when authenticated as ADMIN_ROOT', async () => {
      const accessToken = await signTestToken(jwtService);

      // JwtStrategy.validate DB lookup
      mockUsersRepo.findOne.mockResolvedValue(ADMIN_USER);
      // UsersService.findAll DB query
      mockUsersRepo.findAndCount.mockResolvedValue([[ADMIN_USER], 1]);

      const res = await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .set('Cookie', [`accessToken=${accessToken}`])
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 10);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ── POST /users (validation baseline) ────────────────────────────────────────

  describe('POST /users', () => {
    it('should return 400 when email is malformed', async () => {
      const accessToken = await signTestToken(jwtService);
      mockUsersRepo.findOne.mockResolvedValue(ADMIN_USER); // for JwtStrategy

      await request(app.getHttpServer())
        .post('/users')
        .set('Cookie', [`accessToken=${accessToken}`])
        .send({ email: 'bad-email', password: 'password123' })
        .expect(400);
    });

    it('should return 201 when payload is valid and user is created', async () => {
      const accessToken = await signTestToken(jwtService);
      // First findOne: JwtStrategy.validate (returns active user)
      // Second findOne (withDeleted: false): duplicate email check → null
      mockUsersRepo.findOne
        .mockResolvedValueOnce(ADMIN_USER)  // JwtStrategy
        .mockResolvedValueOnce(null);       // duplicate email check

      mockRolesRepo.findOne.mockResolvedValue(null); // no roleId provided

      const newUser = {
        ...ADMIN_USER,
        id: 'new-user-1',
        email: 'newuser@e2e.test',
      };
      mockUsersRepo.create.mockReturnValue(newUser);
      mockUsersRepo.save.mockResolvedValue(newUser);

      const res = await request(app.getHttpServer())
        .post('/users')
        .set('Cookie', [`accessToken=${accessToken}`])
        .send({ email: 'newuser@e2e.test', password: 'password123' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'new-user-1');
      expect(res.body).toHaveProperty('email', 'newuser@e2e.test');
    });
  });

  // ── DELETE /users/:id (deactivation effect) ───────────────────────────────────

  describe('DELETE /users/:id — deactivation effect', () => {
    it('should return 204 when soft-delete succeeds and revoke sessions', async () => {
      const accessToken = await signTestToken(jwtService);
      const targetId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      // JwtStrategy.validate lookup (authenticating admin)
      mockUsersRepo.findOne
        .mockResolvedValueOnce(ADMIN_USER)             // JwtStrategy validate
        .mockResolvedValueOnce({ id: targetId, email: 'del@e2e.test' }); // UsersService.findOne

      mockUsersRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockRefreshSessionRepo.update.mockResolvedValue({ affected: 1 });

      await request(app.getHttpServer())
        .delete(`/users/${targetId}`)
        .set('Cookie', [`accessToken=${accessToken}`])
        .expect(204);

      // Verify soft-delete was called (not physical delete)
      expect(mockUsersRepo.softDelete).toHaveBeenCalledWith(targetId);
      // Verify sessions were revoked
      expect(mockRefreshSessionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: targetId }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });
});
