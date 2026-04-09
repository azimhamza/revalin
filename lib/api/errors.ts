import { z } from 'zod';

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'internal_error';

export type ApiFieldError = {
  path: string;
  message: string;
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly fieldErrors?: ApiFieldError[];
  readonly details?: unknown;

  constructor(args: {
    code: ApiErrorCode;
    message: string;
    status: number;
    retryable?: boolean;
    fieldErrors?: ApiFieldError[];
    details?: unknown;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.code = args.code;
    this.status = args.status;
    this.retryable = Boolean(args.retryable);
    this.fieldErrors = args.fieldErrors;
    this.details = args.details;
  }
}

function toFieldErrors(error: z.ZodError): ApiFieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : 'request',
    message: issue.message,
  }));
}

export const apiError = {
  badRequest(message = 'Invalid request.', details?: unknown) {
    return new ApiError({
      code: 'bad_request',
      message,
      status: 400,
      details,
    });
  },
  validation(message = 'Validation failed.', fieldErrors?: ApiFieldError[]) {
    return new ApiError({
      code: 'validation_failed',
      message,
      status: 400,
      fieldErrors,
    });
  },
  unauthenticated(message = 'Authentication required.') {
    return new ApiError({
      code: 'unauthenticated',
      message,
      status: 401,
    });
  },
  forbidden(message = 'You do not have access to this resource.') {
    return new ApiError({
      code: 'forbidden',
      message,
      status: 403,
    });
  },
  notFound(message = 'Resource not found.') {
    return new ApiError({
      code: 'not_found',
      message,
      status: 404,
    });
  },
  conflict(message = 'The requested operation conflicts with the current state.', details?: unknown) {
    return new ApiError({
      code: 'conflict',
      message,
      status: 409,
      details,
    });
  },
  rateLimited(message = 'Too many requests. Please try again shortly.', details?: unknown) {
    return new ApiError({
      code: 'rate_limited',
      message,
      status: 429,
      retryable: true,
      details,
    });
  },
  providerTimeout(message = 'A provider request timed out.', details?: unknown) {
    return new ApiError({
      code: 'provider_timeout',
      message,
      status: 503,
      retryable: true,
      details,
    });
  },
  providerUnavailable(message = 'A provider request failed.', details?: unknown, retryable = true) {
    return new ApiError({
      code: 'provider_unavailable',
      message,
      status: 502,
      retryable,
      details,
    });
  },
  internal(message = 'Internal server error.', details?: unknown) {
    return new ApiError({
      code: 'internal_error',
      message,
      status: 500,
      details,
    });
  },
};

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return apiError.validation(
      error.issues[0]?.message || 'Validation failed.',
      toFieldErrors(error),
    );
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return apiError.providerTimeout('The upstream request timed out.');
  }

  if (typeof error === 'object' && error && 'statusCode' in error) {
    const errorRecord = error as Record<string, unknown>;
    const statusCode = errorRecord.statusCode;
    const message =
      typeof errorRecord.message === 'string'
        ? errorRecord.message
        : 'Request failed.';

    if (typeof statusCode === 'number') {
      if (statusCode === 401) return apiError.unauthenticated(message);
      if (statusCode === 403) return apiError.forbidden(message);
      if (statusCode === 404) return apiError.notFound(message);
      if (statusCode === 409) return apiError.conflict(message);
      if (statusCode === 429) return apiError.rateLimited(message);

      return new ApiError({
        code: statusCode >= 500 ? 'internal_error' : 'bad_request',
        message,
        status: statusCode,
        retryable: statusCode >= 500,
      });
    }
  }

  if (error instanceof Error) {
    return apiError.internal(error.message || 'Internal server error.');
  }

  return apiError.internal();
}
