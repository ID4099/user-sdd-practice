import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserDto } from './update-user.dto';

describe('UpdateUserDto', () => {
  it('accepts an empty payload (all fields optional)', async () => {
    const dto = plainToInstance(UpdateUserDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid email when provided', async () => {
    const dto = plainToInstance(UpdateUserDto, { email: 'new@example.com' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed email when provided', async () => {
    const dto = plainToInstance(UpdateUserDto, { email: 'bad-email' });
    const errors = await validate(dto);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('accepts a valid password when provided', async () => {
    const dto = plainToInstance(UpdateUserDto, { password: 'NewPass1' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a password shorter than 6 chars when provided', async () => {
    const dto = plainToInstance(UpdateUserDto, { password: 'abc' });
    const errors = await validate(dto);
    const passError = errors.find((e) => e.property === 'password');
    expect(passError).toBeDefined();
  });

  it('accepts a valid roleId UUID when provided', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID roleId when provided', async () => {
    const dto = plainToInstance(UpdateUserDto, { roleId: 'not-a-uuid' });
    const errors = await validate(dto);
    const roleError = errors.find((e) => e.property === 'roleId');
    expect(roleError).toBeDefined();
  });
});
