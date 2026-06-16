import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_ROOT } from '../roles/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';
import { PaginatedUsers, UsersService } from './users.service';

/**
 * Exposes the user management endpoints under /users.
 *
 * ALL routes require a valid JWT access token (JwtAuthGuard) and
 * the ADMIN_ROOT role (RolesGuard). The guards are applied at the
 * controller level so they protect every route automatically.
 *
 * HTTP code alignment with specs:
 *  - GET  /users            200 (list) | 401 (unauthenticated) | 403 (wrong role)
 *  - POST /users            201 (created) | 400 (validation) | 409 (duplicate email)
 *  - PATCH /users/:id       200 (updated) | 404 (not found)
 *  - DELETE /users/:id      204 (soft-deleted — no body) | 404 (not found)
 *  - POST /users/:id/reactivate  200 (reactivated) | 404 (not found)
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ADMIN_ROOT)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /users?page=1&limit=10 ─────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: PaginationQueryDto): Promise<PaginatedUsers> {
    return this.usersService.findAll(query);
  }

  // ── GET /users/:id ─────────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  // ── POST /users ────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  // ── PATCH /users/:id ───────────────────────────────────────────────────────

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, updateUserDto);
  }

  // ── DELETE /users/:id (soft delete) ───────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.remove(id);
  }

  // ── POST /users/:id/reactivate ─────────────────────────────────────────────

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.reactivate(id);
  }
}
