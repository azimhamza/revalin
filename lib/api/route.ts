import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAdmin, requireAffiliateOrAdmin, requirePromoterOrAdmin, requireSession, optionalSession } from '@/lib/api/auth';
import type { AuthenticatedSession } from '@/lib/api/auth';
import { apiError, normalizeApiError } from '@/lib/api/errors';
import { assertRateLimit, type RateLimitProfile } from '@/lib/api/rate-limit';
import { searchParamsToObject } from '@/lib/api/request';
import { apiErrorResponse, apiList, apiSuccess, attachRequestId } from '@/lib/api/response';

type AccessPolicy =
  | 'public'
  | 'session'
  | 'fresh-session'
  | 'admin'
  | 'affiliate-or-admin'
  | 'promoter-or-admin';

type HandlerResult<T> =
  | Response
  | {
      data: T;
      meta?: Record<string, unknown>;
      status?: number;
      headers?: HeadersInit;
      cacheControl?: string;
    };

type ListHandlerResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  cacheControl?: string;
};

type RouteHandlerArgs<TBody, TQuery, TParams, TSession> = {
  request: Request;
  requestId: string;
  body: TBody;
  query: TQuery;
  params: TParams;
  session: TSession;
};

type DefaultQuery = Record<string, string | string[]>;
type DefaultParams = Record<string, string>;
type RouteContext = {
  params: Promise<DefaultParams>;
};

type InferSchema<TSchema extends z.ZodTypeAny | undefined, TFallback> =
  TSchema extends z.ZodTypeAny ? z.infer<TSchema> : TFallback;

type SessionForAccess<TAccess extends AccessPolicy | undefined> =
  TAccess extends 'public' | undefined
    ? Awaited<ReturnType<typeof optionalSession>>
    : AuthenticatedSession;

function logRouteEvent(args: {
  level: 'info' | 'error';
  route: string;
  requestId: string;
  method: string;
  status: number;
  durationMs: number;
  errorCode?: string;
}) {
  const payload = {
    scope: 'api',
    route: args.route,
    requestId: args.requestId,
    method: args.method,
    status: args.status,
    durationMs: args.durationMs,
    ...(args.errorCode ? { errorCode: args.errorCode } : {}),
  };

  if (args.level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}

async function resolveSession(access: AccessPolicy) {
  if (access === 'public') {
    return null;
  }
  if (access === 'session') {
    return requireSession();
  }
  if (access === 'fresh-session') {
    return requireSession({ fresh: true });
  }
  if (access === 'admin') {
    return requireAdmin();
  }
  if (access === 'promoter-or-admin') {
    return requirePromoterOrAdmin();
  }
  return requireAffiliateOrAdmin();
}

type CreateRouteConfig<
  TAccess extends AccessPolicy | undefined,
  TBodySchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
  TParamsSchema extends z.ZodTypeAny | undefined,
  TData,
> = {
  route: string;
  access?: TAccess;
  rateLimit?: RateLimitProfile;
  bodySchema?: TBodySchema;
  querySchema?: TQuerySchema;
  paramsSchema?: TParamsSchema;
  cacheControl?: string;
  handler: (
    args: RouteHandlerArgs<
      InferSchema<TBodySchema, undefined>,
      InferSchema<TQuerySchema, DefaultQuery>,
      InferSchema<TParamsSchema, DefaultParams>,
      SessionForAccess<TAccess>
    >,
  ) => Promise<HandlerResult<TData>>;
};

type CreateListRouteConfig<
  TAccess extends AccessPolicy | undefined,
  TBodySchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
  TParamsSchema extends z.ZodTypeAny | undefined,
  TData,
> = {
  route: string;
  access?: TAccess;
  rateLimit?: RateLimitProfile;
  bodySchema?: TBodySchema;
  querySchema?: TQuerySchema;
  paramsSchema?: TParamsSchema;
  cacheControl?: string;
  handler: (
    args: RouteHandlerArgs<
      InferSchema<TBodySchema, undefined>,
      InferSchema<TQuerySchema, DefaultQuery>,
      InferSchema<TParamsSchema, DefaultParams>,
      SessionForAccess<TAccess>
    >,
  ) => Promise<ListHandlerResult<TData>>;
};

export function createApiRoute<
  TAccess extends AccessPolicy | undefined = undefined,
  TBodySchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TData = unknown,
>(
  config: CreateRouteConfig<TAccess, TBodySchema, TQuerySchema, TParamsSchema, TData>,
) {
  return async function routeHandler(
    request: Request,
    context: RouteContext,
  ) {
    const startedAt = Date.now();
    const requestId = request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

    try {
      assertRateLimit({ request, profile: config.rateLimit });

      const rawParams = context.params ? await context.params : {};
      const params = config.paramsSchema
        ? config.paramsSchema.parse(rawParams)
        : (rawParams as InferSchema<TParamsSchema, DefaultParams>);
      const rawQuery = searchParamsToObject(new URL(request.url).searchParams);
      const query = config.querySchema
        ? config.querySchema.parse(rawQuery)
        : (rawQuery as InferSchema<TQuerySchema, DefaultQuery>);
      let body = undefined as InferSchema<TBodySchema, undefined>;
      if (config.bodySchema) {
        const json = await request.json().catch(() => {
          throw apiError.validation('Invalid JSON body.', [
            {
              path: 'body',
              message: 'Invalid JSON body.',
            },
          ]);
        });
        body = config.bodySchema.parse(json);
      }

      const session = (await resolveSession(
        config.access ?? 'public',
      )) as SessionForAccess<TAccess>;
      const result = await config.handler({
        request,
        requestId,
        body,
        query,
        params,
        session,
      });

      const durationMs = Date.now() - startedAt;

      if (result instanceof Response) {
        logRouteEvent({
          level: result.status >= 500 ? 'error' : 'info',
          route: config.route,
          requestId,
          method: request.method,
          status: result.status,
          durationMs,
        });
        return attachRequestId(result, requestId, config.cacheControl);
      }

      const response = apiSuccess({
        data: result.data,
        meta: result.meta,
        requestId,
        status: result.status,
        headers: result.headers,
        cacheControl: result.cacheControl ?? config.cacheControl,
      });

      logRouteEvent({
        level: response.status >= 500 ? 'error' : 'info',
        route: config.route,
        requestId,
        method: request.method,
        status: response.status,
        durationMs,
      });

      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const normalized = normalizeApiError(error);
      logRouteEvent({
        level: 'error',
        route: config.route,
        requestId,
        method: request.method,
        status: normalized.status,
        durationMs,
        errorCode: normalized.code,
      });
      return apiErrorResponse({
        error: normalized,
        requestId,
        cacheControl: config.cacheControl,
      });
    }
  };
}

export function createApiListRoute<
  TAccess extends AccessPolicy | undefined = undefined,
  TBodySchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TData = unknown,
>(
  config: CreateListRouteConfig<TAccess, TBodySchema, TQuerySchema, TParamsSchema, TData>,
) {
  return async function routeHandler(
    request: Request,
    context: RouteContext,
  ) {
    const startedAt = Date.now();
    const requestId = request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

    try {
      assertRateLimit({ request, profile: config.rateLimit });

      const rawParams = context.params ? await context.params : {};
      const params = config.paramsSchema
        ? config.paramsSchema.parse(rawParams)
        : (rawParams as InferSchema<TParamsSchema, DefaultParams>);
      const rawQuery = searchParamsToObject(new URL(request.url).searchParams);
      const query = config.querySchema
        ? config.querySchema.parse(rawQuery)
        : (rawQuery as InferSchema<TQuerySchema, DefaultQuery>);
      let body = undefined as InferSchema<TBodySchema, undefined>;
      if (config.bodySchema) {
        const json = await request.json().catch(() => {
          throw apiError.validation('Invalid JSON body.', [
            {
              path: 'body',
              message: 'Invalid JSON body.',
            },
          ]);
        });
        body = config.bodySchema.parse(json);
      }

      const session = (await resolveSession(
        config.access ?? 'public',
      )) as SessionForAccess<TAccess>;
      const result = await config.handler({
        request,
        requestId,
        body,
        query,
        params,
        session,
      });

      const response = apiList({
        data: result.data,
        requestId,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        cacheControl: result.cacheControl ?? config.cacheControl,
      });

      logRouteEvent({
        level: response.status >= 500 ? 'error' : 'info',
        route: config.route,
        requestId,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });

      return response;
    } catch (error) {
      const normalized = normalizeApiError(error);
      logRouteEvent({
        level: 'error',
        route: config.route,
        requestId,
        method: request.method,
        status: normalized.status,
        durationMs: Date.now() - startedAt,
        errorCode: normalized.code,
      });
      return apiErrorResponse({
        error: normalized,
        requestId,
        cacheControl: config.cacheControl,
      });
    }
  };
}
