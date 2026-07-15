// Carga .env.test — la ruta la fija DOTENV_CONFIG_PATH en el script test:e2e.
// dotenv no pisa variables ya presentes: en CI las env del job tienen prioridad.
import 'dotenv/config';
import { Client } from 'pg';

/**
 * Prepara la DB de los e2e: la crea si no existe y corre las migraciones.
 * Se ejecuta antes de jest en `pnpm test:e2e`.
 */
async function main(): Promise<void> {
  const dbName = process.env.DB_NAME ?? '';
  // Cinturón de seguridad: jamás operar sobre una DB que no sea de test.
  if (!dbName.includes('test')) {
    throw new Error(
      `DB_NAME debe ser una base de test (recibido: "${dbName}"). ¿Se cargó .env.test?`,
    );
  }

  // CREATE DATABASE no soporta IF NOT EXISTS: chequear el catálogo primero.
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  const exists = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`DB de test "${dbName}" creada.`);
  }
  await client.end();

  // Import dinámico: el data-source lee process.env, que ya apunta a la DB de test.
  const { default: dataSource } = await import('../src/database/data-source');
  await dataSource.initialize();
  const executed = await dataSource.runMigrations();
  await dataSource.destroy();
  console.log(
    `DB de test lista (${executed.length} migraciones nuevas ejecutadas).`,
  );
}

main().catch((error) => {
  console.error('Fallo preparando la DB de test:', error);
  process.exit(1);
});
