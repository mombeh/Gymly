import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal server error',
  [HttpStatus.BAD_REQUEST]: 'Bad request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable entity',
};

function resolveErrorName(status: number): string {
  return DEFAULT_MESSAGES[status] ?? 'Error';
}

/**
 * Produces one consistent JSON error shape for every unhandled exception, and
 * keeps internal failure detail in the logs rather than the response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = DEFAULT_MESSAGES[status] ?? 'Error';
    let error = resolveErrorName(status);

    if (isHttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        message = payload;
      } else if (payload !== null && typeof payload === 'object') {
        const body = payload as Record<string, unknown>;
        const payloadError = body['error'];

        if (typeof payloadError === 'string') {
          error = payloadError;
        }

        const payloadMessage = body['message'];

        if (typeof payloadMessage === 'string' || Array.isArray(payloadMessage)) {
          message = payloadMessage as string | string[];
        }
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed with ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.originalUrl} failed with ${status}: ${String(message)}`);
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}
