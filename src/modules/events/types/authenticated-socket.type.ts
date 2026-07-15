import type { DefaultEventsMap, Socket } from 'socket.io';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';

/**
 * Socket con data tipado: WsAuthService deja el usuario en data.user durante
 * el handshake. El cuarto genérico de Socket tipa `data` (por defecto es any).
 */
export type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { user?: AuthenticatedUser }
>;
