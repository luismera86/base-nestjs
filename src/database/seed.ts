import 'dotenv/config';
import * as argon2 from 'argon2';
import { PASSWORD_STRENGTH } from '../common/decorators/is-strong-password.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../modules/users/entities/user.entity';
import dataSource from './data-source';

/**
 * Seed idempotente del primer admin: `pnpm seed`.
 * Crea (o promueve) el usuario de SEED_ADMIN_EMAIL como admin verificado.
 * Correrlo N veces es seguro: si ya está como admin, no hace nada.
 */
async function seed(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Definir SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en el entorno (.env).',
    );
  }
  if (
    password.length < 8 ||
    password.length > 128 ||
    !PASSWORD_STRENGTH.test(password)
  ) {
    throw new Error(
      'SEED_ADMIN_PASSWORD debe cumplir la política: 8-128 caracteres con minúscula, mayúscula, número y carácter especial.',
    );
  }

  await dataSource.initialize();
  const users = dataSource.getRepository(User);

  const existing = await users.findOne({ where: { email } });
  if (!existing) {
    await users.save(
      users.create({
        email,
        password: await argon2.hash(password, { type: argon2.argon2id }),
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      }),
    );
    console.log(`Admin "${email}" creado y verificado.`);
  } else if (existing.role !== Role.ADMIN || !existing.emailVerifiedAt) {
    await users.update(existing.id, {
      role: Role.ADMIN,
      emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
    });
    console.log(`Usuario "${email}" promovido a admin (password sin cambios).`);
  } else {
    console.log(`Admin "${email}" ya existe: nada que hacer.`);
  }

  await dataSource.destroy();
}

seed().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
