import { Exclude } from 'class-transformer';
import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  // select: false → no viaja en queries normales; @Exclude → jamás se serializa.
  @Exclude()
  @Column({ select: false })
  password: string;

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
