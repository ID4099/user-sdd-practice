import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/** DTO for POST /auth/login request body. */
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
