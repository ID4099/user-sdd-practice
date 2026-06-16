import { Response, Request } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockAuthService: Partial<AuthService> = {
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
};

function mockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockRequest(cookies: Record<string, string> = {}, user?: unknown): Partial<Request> {
  return { cookies, user } as Partial<Request>;
}

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    controller = new AuthController(mockAuthService as AuthService);
    jest.clearAllMocks();
  });

  // ── POST /auth/login ───────────────────────────────────────────────────────

  describe('login', () => {
    it('should set httpOnly cookies and return 200 on valid credentials', async () => {
      (mockAuthService.login as jest.Mock).mockResolvedValue({
        accessToken: 'access.jwt',
        refreshToken: 'opaque-refresh',
      });
      const res = mockResponse();

      await controller.login({ email: 'admin@x.com', password: 'pass' }, res as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access.jwt',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'opaque-refresh',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.json).toHaveBeenCalledWith({ message: 'Login successful.' });
    });

    it('should propagate UnauthorizedException from service on invalid credentials', async () => {
      (mockAuthService.login as jest.Mock).mockRejectedValue(
        new UnauthorizedException('Invalid credentials.'),
      );
      const res = mockResponse();

      await expect(
        controller.login({ email: 'x@x.com', password: 'wrong' }, res as Response),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should rotate tokens and set new cookies', async () => {
      (mockAuthService.refresh as jest.Mock).mockResolvedValue({
        accessToken: 'new.access.jwt',
        refreshToken: 'new-refresh',
      });
      const req = mockRequest({ refreshToken: 'old-refresh' }, { id: 'user-1' });
      const res = mockResponse();

      await controller.refresh(req as Request, res as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'accessToken',
        'new.access.jwt',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.json).toHaveBeenCalledWith({ message: 'Tokens refreshed.' });
    });

    it('should throw UnauthorizedException when refresh token cookie is missing', async () => {
      const req = mockRequest({}, { id: 'user-1' });
      const res = mockResponse();

      await expect(controller.refresh(req as Request, res as Response)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── POST /auth/logout ──────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke session, clear cookies, and return 200', async () => {
      (mockAuthService.logout as jest.Mock).mockResolvedValue(undefined);
      const req = mockRequest({ refreshToken: 'valid-token' }, { id: 'user-1' });
      const res = mockResponse();

      await controller.logout(req as Request, res as Response);

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', 'valid-token');
      expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully.' });
    });

    it('should still clear cookies when no refresh token cookie is present (idempotent)', async () => {
      const req = mockRequest({}, { id: 'user-1' });
      const res = mockResponse();

      await controller.logout(req as Request, res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully.' });
    });
  });
});
