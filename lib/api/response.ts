import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api/errors';

type ApiResponseMeta = Record<string, unknown> | undefined;

export type ApiSuccessEnvelope<T> = {
  data: T;
  meta?: ApiResponseMeta;
  requestId: string;
};

export type ApiErrorEnvelope = {
  error: {
    code: ApiError['code'];
    message: string;
    retryable: boolean;
    fieldErrors?: ApiError['fieldErrors'];
    details?: unknown;
  };
  requestId: string;
};

function withRequestHeaders(response: NextResponse, requestId: string, cacheControl = 'no-store') {
  response.headers.set('x-request-id', requestId);
  if (!response.headers.has('cache-control')) {
    response.headers.set('cache-control', cacheControl);
  }
  return response;
}

export function apiSuccess<T>(args: {
  data: T;
  requestId: string;
  meta?: ApiResponseMeta;
  status?: number;
  headers?: HeadersInit;
  cacheControl?: string;
}) {
  const payload: ApiSuccessEnvelope<T> = {
    data: args.data,
    requestId: args.requestId,
  };

  if (args.meta) {
    payload.meta = args.meta;
  }

  const response = NextResponse.json(payload, {
    status: args.status ?? 200,
    headers: args.headers,
  });

  return withRequestHeaders(response, args.requestId, args.cacheControl);
}

export function apiList<T>(args: {
  data: T[];
  requestId: string;
  page: number;
  pageSize: number;
  total: number;
  cacheControl?: string;
}) {
  return apiSuccess({
    data: args.data,
    requestId: args.requestId,
    meta: {
      page: args.page,
      pageSize: args.pageSize,
      total: args.total,
      hasNextPage: args.page * args.pageSize < args.total,
    },
    cacheControl: args.cacheControl,
  });
}

export function apiErrorResponse(args: {
  error: ApiError;
  requestId: string;
  headers?: HeadersInit;
  cacheControl?: string;
}) {
  const response = NextResponse.json(
    {
      error: {
        code: args.error.code,
        message: args.error.message,
        retryable: args.error.retryable,
        ...(args.error.fieldErrors ? { fieldErrors: args.error.fieldErrors } : {}),
        ...(args.error.details !== undefined ? { details: args.error.details } : {}),
      },
      requestId: args.requestId,
    } satisfies ApiErrorEnvelope,
    {
      status: args.error.status,
      headers: args.headers,
    },
  );

  return withRequestHeaders(response, args.requestId, args.cacheControl);
}

export function attachRequestId(response: Response, requestId: string, cacheControl = 'no-store') {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);
  if (!headers.has('cache-control')) {
    headers.set('cache-control', cacheControl);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
