import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorResponseBody = {
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
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.id as string | undefined;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';

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
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    };

    response.status(statusCode).json(responseBody);
  }
}
