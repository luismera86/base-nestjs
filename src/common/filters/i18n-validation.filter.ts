import { ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import {
  I18nValidationException,
  I18nValidationExceptionFilter,
} from 'nestjs-i18n';
import { ErrorResponseBody } from './all-exceptions.filter';

/**
 * Filtro para errores de validación de DTOs (I18nValidationPipe): traduce
 * los mensajes al idioma del request y arma el mismo formato de respuesta
 * que AllExceptionsFilter.
 */
export const createI18nValidationFilter = (): I18nValidationExceptionFilter =>
  new I18nValidationExceptionFilter({
    responseBodyFormatter: (
      host: ArgumentsHost,
      exception: I18nValidationException,
      formattedErrors: object,
    ): Record<string, unknown> => {
      const request = host.switchToHttp().getRequest<Request>();
      const requestId = request.id as string | undefined;

      const responseBody: ErrorResponseBody = {
        statusCode: exception.getStatus(),
        error: 'Bad Request',
        message: formattedErrors as string[],
        path: request.url,
        timestamp: new Date().toISOString(),
        ...(requestId ? { requestId } : {}),
      };
      return responseBody;
    },
  });
