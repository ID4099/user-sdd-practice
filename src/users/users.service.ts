import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { Role } from '../roles/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';

/** Shape of a paginated response returned by findAll. */
export interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Core user management service.
 *
 * Responsibilities:
 *  - CRUD operations on User entities
 *  - Soft-delete (deactivation) that immediately revokes all refresh sessions
 *  - Restore (reactivation) of soft-deleted users
 *
 * Physical deletion is explicitly NOT supported per the design decision on
 * soft-delete. All writes go through the ORM hooks on User (bcrypt hashing).
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    // Injected by module — used for session revocation on soft-delete
    private readonly authService: AuthService,
  ) {}

  // ── findAll ───────────────────────────────────────────────────────────────

  /**
   * Returns a paginated list of active (non-deleted) users.
   */
  async findAll(query: PaginationQueryDto): Promise<PaginatedUsers> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await this.usersRepository.findAndCount({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  // ── findOne ───────────────────────────────────────────────────────────────

  /**
   * Returns a single active user by ID.
   *
   * @throws NotFoundException – when the user does not exist or is soft-deleted
   */
  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found.`);
    }
    return user;
  }

  // ── create ────────────────────────────────────────────────────────────────

  /**
   * Creates a new user.
   *
   * @throws ConflictException  – when the email address is already in use
   * @throws NotFoundException  – when the specified roleId does not exist
   */
  async create(dto: CreateUserDto): Promise<User> {
    // Prevent duplicate email addresses (withDeleted: false → only active rows)
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
      withDeleted: false,
    });
    if (existing) {
      throw new ConflictException(
        `A user with email "${dto.email}" already exists.`,
      );
    }

    // Resolve role when provided
    let role: Role | null = null;
    if (dto.roleId) {
      const found = await this.rolesRepository.findOne({
        where: { id: dto.roleId },
      });
      if (!found) {
        throw new NotFoundException(
          `Role with id "${dto.roleId}" not found.`,
        );
      }
      role = found;
    }

    const user = this.usersRepository.create({
      email: dto.email,
      password: dto.password, // entity hook will bcrypt-hash before INSERT
      role,
    });

    return this.usersRepository.save(user);
  }

  // ── update ────────────────────────────────────────────────────────────────

  /**
   * Partially updates a user.
   *
   * @throws NotFoundException – when the user does not exist
   * @throws NotFoundException – when the specified roleId does not exist
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found.`);
    }

    if (dto.email !== undefined) {
      user.email = dto.email;
    }

    if (dto.password !== undefined) {
      // Assign plain text — entity @BeforeUpdate hook will hash it
      user.password = dto.password;
    }

    if (dto.roleId !== undefined) {
      const role = await this.rolesRepository.findOne({
        where: { id: dto.roleId },
      });
      if (!role) {
        throw new NotFoundException(
          `Role with id "${dto.roleId}" not found.`,
        );
      }
      user.role = role;
    }

    return this.usersRepository.save(user);
  }

  // ── remove (soft delete) ──────────────────────────────────────────────────

  /**
   * Soft-deletes a user (populates deletedAt) and immediately revokes all
   * their active refresh sessions so the next protected request returns 401/403.
   *
   * @throws NotFoundException – when the user does not exist
   */
  async remove(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found.`);
    }

    await this.usersRepository.softDelete(id);

    // Revoke all refresh sessions — ensures the user cannot renew their access
    // token even within the 15-minute access token lifetime window.
    await this.authService.revokeAllSessionsForUser(id);
  }

  // ── reactivate ────────────────────────────────────────────────────────────

  /**
   * Restores a soft-deleted user (clears deletedAt).
   *
   * @throws NotFoundException – when the user does not exist (active or deleted)
   */
  async reactivate(id: string): Promise<User> {
    // withDeleted: true — the user row still exists, just soft-deleted
    const user = await this.usersRepository.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found.`);
    }

    await this.usersRepository.restore(id);

    // Re-fetch the restored user to return current state
    return this.usersRepository.findOne({ where: { id } }) as Promise<User>;
  }
}
