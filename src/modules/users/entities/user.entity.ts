import { Exclude } from 'class-transformer';
import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  // select: false → no viaja en queries normales; @Exclude → jamás se serializa.
  @Exclude()
  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  // null = correo aún no verificado (bloquea el login).
  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @Exclude()
  @Column({ type: 'varchar', nullable: true, select: false })
  emailVerificationTokenHash: string | null;

  @Exclude()
  @Column({ type: 'varchar', nullable: true, select: false })
  refreshTokenHash: string | null;

  // Hash SHA-256 del token de recuperación de contraseña (nunca el token en claro).
  @Exclude()
  @Column({ type: 'varchar', nullable: true, select: false })
  passwordResetTokenHash: string | null;

  @Exclude()
  @Column({ type: 'timestamp', nullable: true, select: false })
  passwordResetExpiresAt: Date | null;
}
