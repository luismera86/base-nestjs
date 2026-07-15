import { ArgumentsHost, ConflictException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import {
  AllExceptionsFilter,
  ErrorResponseBody,
} from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const i18n = {
    translate: jest.fn().mockImplementation((key: string) => `t:${key}`),
  } as unknown as I18nService;
  const filter = new AllExceptionsFilter(i18n);

  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  const hostMock = (): ArgumentsHost => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ id: 'req-1', method: 'POST', url: '/x' }),
      }),
      getType: () => 'http',
    } as unknown as ArgumentsHost;
  };

  const sentBody = (): ErrorResponseBody =>
    (jsonMock.mock.calls[0] as [ErrorResponseBody])[0];

  const queryFailed = (code: string): QueryFailedError =>
    new QueryFailedError(
      'INSERT INTO users ...',
      [],
      Object.assign(new Error('db error'), { code }),
    );

  it('mapea unique_violation (23505) a 409 sin filtrar detalles de SQL', () => {
    filter.catch(queryFailed('23505'), hostMock());

    expect(statusMock).toHaveBeenCalledWith(409);
    const body = sentBody();
    expect(body.error).toBe('Conflict');
    expect(body.message).toBe('t:errors.DUPLICATE_RESOURCE');
    expect(JSON.stringify(body)).not.toContain('INSERT');
  });

  it('mapea foreign_key_violation (23503) a 409 y uuid inválido (22P02) a 400', () => {
    filter.catch(queryFailed('23503'), hostMock());
    expect(statusMock).toHaveBeenCalledWith(409);

    filter.catch(queryFailed('22P02'), hostMock());
    expect(statusMock).toHaveBeenCalledWith(400);
  });

  it('un QueryFailedError no mapeado sigue siendo 500 opaco', () => {
    filter.catch(queryFailed('42P01'), hostMock());

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(sentBody().message).toBe('t:errors.INTERNAL_SERVER_ERROR');
  });

  it('las HttpException pasan intactas (status y mensaje propios)', () => {
    filter.catch(
      new ConflictException('errors.EMAIL_ALREADY_REGISTERED'),
      hostMock(),
    );

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(sentBody().message).toBe('t:errors.EMAIL_ALREADY_REGISTERED');
  });

  it('una excepción desconocida responde 500 genérico con requestId', () => {
    filter.catch(new Error('boom interno'), hostMock());

    expect(statusMock).toHaveBeenCalledWith(500);
    const body = sentBody();
    expect(body.requestId).toBe('req-1');
    expect(JSON.stringify(body)).not.toContain('boom interno');
  });
});
