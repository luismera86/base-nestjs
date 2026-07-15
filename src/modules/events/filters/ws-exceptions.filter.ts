import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

type WsErrorPayload = {
  status: number;
  message: string;
  timestamp: string;
};

/**
 * Filtro de excepciones para gateways (@UseFilters a nivel de clase: tiene
 * prioridad sobre los APP_FILTER globales, que son HTTP-only). Emite el
 * evento 'exception' con un payload consistente. Los mensajes son claves
 * del catálogo i18n sin traducir (en WS no hay Accept-Language por evento).
 */
@Catch()
export class WsExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const socket = host.switchToWs().getClient<Socket>();

    let status = 500;
    let message = 'errors.INTERNAL_SERVER_ERROR';

    if (exception instanceof WsException) {
      status = 400;
      const error = exception.getError();
      message = typeof error === 'string' ? error : exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else {
      // Excepción inesperada: detalle completo al log, nunca al cliente.
      this.logger.error(
        `Unhandled ws exception (socket=${socket.id})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: WsErrorPayload = {
      status,
      message,
      timestamp: new Date().toISOString(),
    };
    socket.emit('exception', payload);
  }
}
