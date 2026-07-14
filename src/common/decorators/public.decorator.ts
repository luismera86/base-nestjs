import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca una ruta como pública (sin autenticación).
 * El guard JWT es global: toda ruta sin @Public() exige un access token válido.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
