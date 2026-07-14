import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAt1784072142996 implements MigrationInterface {
  name = 'AddDeletedAt1784072142996';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
  }
}
