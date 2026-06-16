import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  function buildValid(overrides: Partial<CreateUserDto> = {}): CreateUserDto {
    return plainToInstance(CreateUserDto, {
      email: 'admin@example.com',
      password: 'Secret123',
      roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      ...overrides,
    });
  }

  it('accepts a valid payload', async () => {
    const dto = buildValid();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    const dto = buildValid({ email: 'not-an-email' });
    const errors = await validate(dto);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('rejects a password shorter than 6 characters', async () => {
    const dto = buildValid({ password: 'abc' });
    const errors = await validate(dto);
    const passError = errors.find((e) => e.property === 'password');
    expect(passError).toBeDefined();
  });

  it('rejects a missing email', async () => {
    const dto = buildValid({ email: undefined as any });
    const errors = await validate(dto);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('accepts an optional roleId (may be omitted)', async () => {
    const dto = buildValid({ roleId: undefined });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID roleId when provided', async () => {
    const dto = buildValid({ roleId: 'not-a-uuid' });
    const errors = await validate(dto);
    const roleError = errors.find((e) => e.property === 'roleId');
    expect(roleError).toBeDefined();
  });
});
