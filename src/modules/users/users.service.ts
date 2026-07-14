import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { GetProfileUseCase } from './use-cases/get-profile.use-case';

/**
 * Fachada del módulo: canaliza los use cases.
 * La lógica de negocio vive en use-cases/, uno por operación.
 */
@Injectable()
export class UsersService {
  constructor(private readonly getProfileUseCase: GetProfileUseCase) {}

  getProfile(userId: string): Promise<User> {
    return this.getProfileUseCase.execute(userId);
  }
}
