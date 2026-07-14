// Corre antes de cargar los specs (setupFiles): fuerza NODE_ENV=test para
// que el logger no escriba archivos en logs/ ni salida pretty durante los
// tests (ver buildDestinations en src/config/logger.config.ts).
process.env.NODE_ENV = 'test';
