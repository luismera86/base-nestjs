/**
 * Payload que viaja en request.user tras validar el access token.
 */
export type AuthenticatedUser = {
  id: string;
  email: string;
};

/**
 * Variante para el flujo de refresh: incluye el token crudo
 * para poder compararlo contra el hash guardado en DB.
 */
export type AuthenticatedUserWithRefreshToken = AuthenticatedUser & {
  refreshToken: string;
};
