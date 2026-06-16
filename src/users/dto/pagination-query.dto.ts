import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * DTO for paginated list queries (GET /users?page=1&limit=10).
 *
 * class-transformer coerces query-string values to numbers via @Type(() => Number).
 * The global ValidationPipe must be configured with { transform: true } for
 * this coercion to apply on query params.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
