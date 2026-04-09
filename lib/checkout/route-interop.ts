import { apiError } from '@/lib/api/errors';

export function getRouteErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }

  return fallback;
}

export function throwRouteError(status: number, payload: unknown, fallback: string) {
  const message = getRouteErrorMessage(payload, fallback);

  if (status === 400) {
    throw apiError.badRequest(message);
  }
  if (status === 401) {
    throw apiError.unauthenticated(message);
  }
  if (status === 403) {
    throw apiError.forbidden(message);
  }
  if (status === 404) {
    throw apiError.notFound(message);
  }
  if (status === 409) {
    throw apiError.conflict(message);
  }
  if (status === 429) {
    throw apiError.rateLimited(message);
  }
  if (status === 502 || status === 503) {
    throw apiError.providerUnavailable(message);
  }

  throw apiError.internal(message);
}
