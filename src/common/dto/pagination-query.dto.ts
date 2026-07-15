import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/**
 * Query de paginación estándar para todo listado:
 * `GET /recurso?page=2&limit=20&order=desc`
 * El orden se aplica sobre `createdAt` (cada use case puede decidir otra columna).
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(100, { message: i18nValidationMessage('validation.MAX') })
  limit: number = 20;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: i18nValidationMessage('validation.IS_IN') })
  order: 'asc' | 'desc' = 'desc';

  /** Offset listo para pasarle a TypeORM (skip). */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
