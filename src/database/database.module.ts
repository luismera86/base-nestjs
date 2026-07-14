import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        username: config.getOrThrow<string>('database.username'),
        password: config.getOrThrow<string>('database.password'),
        database: config.getOrThrow<string>('database.name'),
        ssl: config.get<boolean>('database.ssl')
          ? { rejectUnauthorized: false }
          : false,
        // Columnas/joins en snake_case sin declarar `name` en cada @Column.
        namingStrategy: new SnakeNamingStrategy(),
        autoLoadEntities: true,
        // Nunca sincronizar el schema automáticamente: usar migraciones (pnpm migration:run).
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
