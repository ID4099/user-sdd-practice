import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
  function build(
    overrides: Partial<PaginationQueryDto> = {},
  ): PaginationQueryDto {
    return plainToInstance(PaginationQueryDto, { page: 1, limit: 10, ...overrides });
  }

  it('accepts valid page and limit', async () => {
    const dto = build({ page: 2, limit: 25 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('transforms string query params to numbers', () => {
    // Query strings arrive as strings — transform must coerce them
    const dto = plainToInstance(PaginationQueryDto, { page: '3', limit: '15' });
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(15);
  });

  it('rejects page = 0 (must be at least 1)', async () => {
    const dto = build({ page: 0 });
    const errors = await validate(dto);
    const pageError = errors.find((e) => e.property === 'page');
    expect(pageError).toBeDefined();
  });

  it('rejects a negative page', async () => {
    const dto = build({ page: -5 });
    const errors = await validate(dto);
    const pageError = errors.find((e) => e.property === 'page');
    expect(pageError).toBeDefined();
  });

  it('rejects limit = 0 (must be at least 1)', async () => {
    const dto = build({ limit: 0 });
    const errors = await validate(dto);
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
  });

  it('rejects limit > 100', async () => {
    const dto = build({ limit: 101 });
    const errors = await validate(dto);
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
  });

  it('uses default values when params are omitted', () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });
});
