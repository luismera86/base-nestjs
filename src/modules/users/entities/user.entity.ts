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
  @Column({
    name: 'refresh_token_hash',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  refreshTokenHash: string | null;
}
