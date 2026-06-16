import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Stores the bcrypt hash of a refresh token — never the plain-text token.
 *
 * Lifecycle:
 *   - Created on login / refresh rotation
 *   - consumedAt set when the token is rotated (marks it as used)
 *   - revokedAt set on logout, soft-delete of owner, or reuse-detection
 *
 * A session is "active" when consumedAt IS NULL AND revokedAt IS NULL
 * AND expiresAt > NOW().
 */
@Entity('refresh_sessions')
export class RefreshSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * bcrypt hash of the opaque refresh token string.
   * The plain token is returned to the client via httpOnly cookie only.
   */
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  /** Populated when this token is rotated (i.e. used once and replaced). */
  @Column({ name: 'consumed_at', nullable: true, type: 'timestamp' })
  consumedAt: Date | null;

  /** Populated on logout, user soft-delete, or reuse-detection. */
  @Column({ name: 'revoked_at', nullable: true, type: 'timestamp' })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
