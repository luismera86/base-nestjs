import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paginated } from '../../../common/dto/paginated.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class ListUsersUseCase {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async execute(query: PaginationQueryDto): Promise<Paginated<User>> {
    const [items, total] = await this.usersRepository.findAndCount({
      skip: query.skip,
      take: query.limit,
      order: { createdAt: query.order === 'asc' ? 'ASC' : 'DESC' },
    });
    return new Paginated(items, total, query);
  }
}
