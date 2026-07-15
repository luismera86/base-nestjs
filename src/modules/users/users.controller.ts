import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paginated } from '../../common/dto/paginated.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  me(@CurrentUser() currentUser: AuthenticatedUser): Promise<User> {
    return this.usersService.getProfile(currentUser.id);
  }

  // Ejemplo del patrón RBAC + paginación estándar.
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listado paginado de usuarios (solo admin)' })
  list(@Query() query: PaginationQueryDto): Promise<Paginated<User>> {
    return this.usersService.listUsers(query);
  }
}
