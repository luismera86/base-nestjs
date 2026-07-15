import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';

/**
 * Errores conocidos de Postgres → respuesta HTTP prolija.
 * Ejemplo típico: dos registros simultáneos con el mismo email pasan el
 * check de duplicado y el índice UNIQUE frena al segundo → 409, no 500.
 * Lo no mapeado sigue siendo 500 opaco (nunca se filtra SQL al cliente).
 */
const PG_ERRORS: Record<
  string,
  { statusCode: HttpStatus; error: string; message: string }
> = {
  // unique_violation
  '23505': {
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: 'errors.DUPLICATE_RESOURCE',
  },
  // foreign_key_violation
  '23503': {
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: 'errors.RELATED_RESOURCE',
  },
  // invalid_text_representation (ej: uuid malformado en una query)
  '22P02': {
    statusCode: HttpStatus.BAD_REQUEST,
    error: 'Bad Request',
    message: 'errors.INVALID_IDENTIFIER',
  },
};

export type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
};

/**
 * Filtro global: toda respuesta de error tiene el mismo formato y nunca
 * expone detalles internos. Las excepciones no-HTTP se loguean completas
 * y al cliente le llega un 500 genérico con el requestId para correlación.
 *
 * i18n: los mensajes se lanzan como claves de traducción ('errors.XXX')
 * y acá se resuelven al idioma pedido en Accept-Language (fallback: es).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.id as string | undefined;
    const lang = I18nContext.current(host)?.lang;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'errors.INTERNAL_SERVER_ERROR';

    const pgError =
      exception instanceof QueryFailedError
        ? PG_ERRORS[
            (exception.driverError as { code?: string } | undefined)?.code ?? ''
          ]
        : undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const httpBody = body as {
          error?: string;
          message?: string | string[];
        };
        error = httpBody.error ?? exception.name;
        message = httpBody.message ?? exception.message;
      }
    } else if (pgError) {
      // Error de DB esperable (unique/FK/uuid): respuesta 4xx y rastro en el log.
      ({ statusCode, error, message } = pgError);
      this.logger.warn(
        `QueryFailedError mapeado a ${statusCode} on ${request.method} ${request.url} (requestId=${requestId ?? '-'})`,
      );
    } else {
      // Excepción inesperada: detalle completo al log, nunca al cliente.
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url} (requestId=${requestId ?? '-'})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const responseBody: ErrorResponseBody = {
      statusCode,
      error,
      message: Array.isArray(message)
        ? message.map((item) => this.translate(item, lang))
        : this.translate(message, lang),
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    };

    response.status(statusCode).json(responseBody);
  }

  // Solo se traducen mensajes que son claves ('errors.*'); el resto pasa tal cual.
  private translate(message: string, lang?: string): string {
    if (!message.startsWith('errors.')) {
      return message;
    }
    return this.i18n.translate(message, { lang });
  }
}
