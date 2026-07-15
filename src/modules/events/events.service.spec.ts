import type { Namespace } from 'socket.io';
import { EventsService, userRoom } from './events.service';

describe('EventsService', () => {
  let service: EventsService;
  let emit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    service = new EventsService();
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
  });

  it('emitToUser emite a la room del usuario', () => {
    service.bind({ to, emit } as unknown as Namespace);

    service.emitToUser('user-id-1', 'notify', { hello: 'world' });

    expect(to).toHaveBeenCalledWith(userRoom('user-id-1'));
    expect(emit).toHaveBeenCalledWith('notify', { hello: 'world' });
  });

  it('emitToAll emite al namespace completo', () => {
    service.bind({ to, emit } as unknown as Namespace);

    service.emitToAll('announcement', { text: 'hola' });

    expect(emit).toHaveBeenCalledWith('announcement', { text: 'hola' });
    expect(to).not.toHaveBeenCalled();
  });

  it('es no-op si el gateway aún no hizo bind', () => {
    expect(() => service.emitToUser('user-id-1', 'notify', {})).not.toThrow();
    expect(to).not.toHaveBeenCalled();
  });
});
