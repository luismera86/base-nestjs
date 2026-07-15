import { Injectable } from '@nestjs/common';
import { Paginated } from '../../common/dto/paginated.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { User } from './entities/user.entity';
import { GetProfileUseCase } from './use-cases/get-profile.use-case';
import { ListUsersUseCase } from './use-cases/list-users.use-case';

/**
 * Fachada del módulo: canaliza los use cases.
 * La lógica de negocio vive en use-cases/, uno por operación.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
  ) {}

  getProfile(userId: string): Promise<User> {
    return this.getProfileUseCase.execute(userId);
  }

  listUsers(query: PaginationQueryDto): Promise<Paginated<User>> {
    return this.listUsersUseCase.execute(query);
  }
}
