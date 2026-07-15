import { PaginationQueryDto } from './pagination-query.dto';

/** Respuesta estándar de todo listado paginado. */
export class Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;

  constructor(items: T[], total: number, query: PaginationQueryDto) {
    this.items = items;
    this.total = total;
    this.page = query.page;
    this.limit = query.limit;
    this.pages = Math.ceil(total / query.limit);
  }
}
