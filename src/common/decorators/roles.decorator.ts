import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Restringe la ruta a los roles indicados: `@Roles(Role.ADMIN)`.
 * Sin este decorador, basta con estar autenticado (o @Public).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
