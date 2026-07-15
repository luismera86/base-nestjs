import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { Role } from '../../common/enums/role.enum';
import { WsAuthService } from './ws-auth.service';

describe('WsAuthService', () => {
  const payload = {
    sub: 'user-id-1',
    email: 'test@example.com',
    role: Role.USER,
  };
  let verifyAsync: jest.Mock;
  let service: WsAuthService;

  /** Socket mínimo: solo el handshake que lee el servicio. */
  const socketWith = (handshake: {
    headers?: { cookie?: string };
    auth?: Record<string, unknown>;
  }): Socket =>
    ({
      handshake: { headers: {}, auth: {}, ...handshake },
    }) as unknown as Socket;

  beforeEach(() => {
    verifyAsync = jest.fn().mockResolvedValue(payload);
    service = new WsAuthService(
      { verifyAsync } as unknown as JwtService,
      {
        getOrThrow: jest.fn().mockReturnValue('a'.repeat(32)),
      } as unknown as ConfigService,
    );
  });

  it('autentica con el access token de la cookie', async () => {
    const socket = socketWith({
      headers: { cookie: 'access_token=valid-token' },
    });

    await expect(service.authenticate(socket)).resolves.toEqual({
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    });
    expect(verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: 'a'.repeat(32),
    });
  });

  it('encuentra la cookie entre varias', async () => {
    const socket = socketWith({
      headers: { cookie: 'other=x; access_token=valid-token; another=y' },
    });

    await service.authenticate(socket);
    expect(verifyAsync).toHaveBeenCalledWith('valid-token', expect.anything());
  });

  it('usa handshake.auth.token como fallback (clientes no-browser)', async () => {
    const socket = socketWith({ auth: { token: 'auth-token' } });

    await service.authenticate(socket);
    expect(verifyAsync).toHaveBeenCalledWith('auth-token', expect.anything());
  });

  it('la cookie tiene prioridad sobre auth.token', async () => {
    const socket = socketWith({
      headers: { cookie: 'access_token=cookie-token' },
      auth: { token: 'auth-token' },
    });

    await service.authenticate(socket);
    expect(verifyAsync).toHaveBeenCalledWith('cookie-token', expect.anything());
  });

  it('rechaza sin token', async () => {
    await expect(service.authenticate(socketWith({}))).rejects.toBeInstanceOf(
      WsException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rechaza tokens inválidos o expirados', async () => {
    verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const socket = socketWith({
      headers: { cookie: 'access_token=expired-token' },
    });

    await expect(service.authenticate(socket)).rejects.toBeInstanceOf(
      WsException,
    );
  });
});
