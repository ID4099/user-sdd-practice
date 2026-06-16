import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../users/user.entity';
import { RefreshSession } from './refresh-session.entity';
import { JwtPayload } from './jwt.strategy';

const BCRYPT_ROUNDS = 10;

/** Token pair returned by login and refresh operations. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Core authentication service.
 *
 * Responsibilities:
 *  - Credential validation + token emission (login)
 *  - Refresh rotation with reuse-detection (refresh)
 *  - Session revocation (logout, revokeAllSessionsForUser)
 *
 * Tokens are NEVER stored in plain-text. The opaque refresh token is
 * returned to the caller (controller sets httpOnly cookie); only the
 * bcrypt hash is persisted in RefreshSession.tokenHash.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshSession)
    private readonly refreshSessionRepository: Repository<RefreshSession>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── login ─────────────────────────────────────────────────────────────────

  /**
   * Validates credentials and emits a fresh access + refresh token pair.
   *
   * @throws UnauthorizedException – user not found or wrong password
   * @throws ForbiddenException    – user is soft-deleted (deactivated)
   */
  async login(email: string, password: string): Promise<TokenPair> {
    // 1. Look up user (include soft-deleted so we can return the right error)
    const user = await this.usersRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // 2. Deactivated users must not receive tokens
    if (user.deletedAt !== null) {
      throw new ForbiddenException('Account has been deactivated.');
    }

    // 3. Verify password
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokenPair(user);
  }

  // ─── refresh ───────────────────────────────────────────────────────────────

  /**
   * Rotates a refresh token: marks the old session as consumed and issues
   * a fresh token pair.
   *
   * Reuse-detection: if the presented token matches a session that was
   * already consumed, the ENTIRE user's sessions are revoked (potential
   * token theft) and a 401 is returned.
   *
   * @throws UnauthorizedException – invalid, expired, revoked, or tampered token
   */
  async refresh(userId: string, plainRefreshToken: string): Promise<TokenPair> {
    // 1. Find the most-recent session for this user (any state — we need to
    //    detect consumed sessions too)
    const session = await this.refreshSessionRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!session) {
      throw new UnauthorizedException('No active session found.');
    }

    // 2. Reuse-detection: token already consumed → full revocation
    if (session.consumedAt !== null) {
      await this.revokeAllSessionsForUser(userId);
      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions have been revoked.',
      );
    }

    // 3. Revoked or expired checks
    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Session has been revoked.');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired.');
    }

    // 4. Verify token hash
    const tokenValid = await bcrypt.compare(plainRefreshToken, session.tokenHash);
    if (!tokenValid) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // 5. Mark old session as consumed (rotation)
    await this.refreshSessionRepository.update(
      { id: session.id },
      { consumedAt: new Date() },
    );

    // 6. Re-fetch user to ensure they are still active
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is no longer active.');
    }

    return this.issueTokenPair(user);
  }

  // ─── logout ────────────────────────────────────────────────────────────────

  /**
   * Revokes the active refresh session identified by the plain token.
   * Idempotent: if no matching session exists, resolves silently.
   */
  async logout(userId: string, plainRefreshToken: string): Promise<void> {
    const session = await this.refreshSessionRepository.findOne({
      where: { userId, consumedAt: IsNull(), revokedAt: IsNull() },
    });

    if (!session) {
      return; // Already logged out or session not found — idempotent
    }

    const tokenValid = await bcrypt.compare(plainRefreshToken, session.tokenHash);
    if (!tokenValid) {
      return; // Token mismatch — nothing to revoke
    }

    await this.refreshSessionRepository.update(
      { id: session.id },
      { revokedAt: new Date() },
    );
  }

  // ─── revokeAllSessionsForUser ──────────────────────────────────────────────

  /**
   * Marks ALL active refresh sessions for a user as revoked.
   * Called on soft-delete (deactivation) and on reuse-detection.
   */
  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.refreshSessionRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async issueTokenPair(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role?.name ?? '',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });

    // Opaque refresh token: random UUID → bcrypt hash stored, plain returned
    const plainRefreshToken = uuidv4();
    const tokenHash = await bcrypt.hash(plainRefreshToken, BCRYPT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const session = this.refreshSessionRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      consumedAt: null,
      revokedAt: null,
    });
    await this.refreshSessionRepository.save(session);

    return { accessToken, refreshToken: plainRefreshToken };
  }
}
