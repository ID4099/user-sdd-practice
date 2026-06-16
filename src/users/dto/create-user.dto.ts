import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

/**
 * DTO for creating a new user.
 *
 * All fields are validated by the global ValidationPipe (whitelist: true,
 * transform: true). roleId is optional — a user may be created without a role
 * and assigned one later via PATCH /users/:id.
 */
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;
}
