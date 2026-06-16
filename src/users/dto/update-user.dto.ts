import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

/**
 * DTO for partial user updates.
 *
 * All fields are optional — a PATCH may update any subset of the user's
 * mutable properties. The global ValidationPipe will strip unknown fields
 * (whitelist: true) and coerce types (transform: true).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;
}
