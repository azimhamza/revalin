import { apiError } from './errors.ts';

type ProviderName =
  | 'swell'
  | 'shipengine'
  | 'shieldclimb'
  | 'nowpayments'
  | 'loops'
  | 'blob';

type ProviderFetchOptions = RequestInit & {
  provider: ProviderName;
  operation: string;
  route?: string;
  timeoutMs?: number;
  retryable?: boolean;
};

const PROVIDER_TIMEOUTS: Record<ProviderName, number> = {
  swell: 4_000,
  shipengine: 3_000,
  shieldclimb: 4_000,
  nowpayments: 4_000,
  loops: 3_000,
  blob: 4_000,
};

function shouldRetry(args: {
  method: string;
  status?: number;
  retryable?: boolean;
}) {
  const isRead = args.method === 'GET' || args.method === 'HEAD';
  if (isRead) {
    return args.status === undefined || args.status === 429 || (args.status >= 500 && args.status <= 599);
  }

  return Boolean(args.retryable && (args.status === undefined || args.status === 429 || (args.status >= 500 && args.status <= 599)));
}

function logProviderEvent(args: {
  provider: ProviderName;
  operation: string;
  route?: string;
  method: string;
  attempt: number;
  durationMs: number;
  status?: number;
  outcome: 'success' | 'retry' | 'error';
}) {
  const payload = {
    scope: 'provider',
    provider: args.provider,
    operation: args.operation,
    route: args.route ?? null,
    method: args.method,
    attempt: args.attempt,
    durationMs: args.durationMs,
    status: args.status ?? null,
    outcome: args.outcome,
  };

  if (args.outcome === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}

export async function providerFetch(
  input: string | URL | Request,
  options: ProviderFetchOptions,
) {
  const method = (options.method || 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUTS[options.provider];
  const attempts = shouldRetry({ method, retryable: options.retryable }) ? 2 : 1;
  const { provider, operation, route, retryable: _retryable, ...init } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const durationMs = Date.now() - startedAt;

      if (attempt < attempts && shouldRetry({ method, status: response.status, retryable: options.retryable })) {
        logProviderEvent({
          provider,
          operation,
          route,
          method,
          attempt,
          durationMs,
          status: response.status,
          outcome: 'retry',
        });
        continue;
      }

      logProviderEvent({
        provider,
        operation,
        route,
        method,
        attempt,
        durationMs,
        status: response.status,
        outcome: response.ok ? 'success' : 'error',
      });
      return response;
    } catch (error) {
      clearTimeout(timeout);
      const durationMs = Date.now() - startedAt;
      const timedOut = error instanceof Error && error.name === 'AbortError';

      if (attempt < attempts && shouldRetry({ method, retryable: options.retryable })) {
        logProviderEvent({
          provider,
          operation,
          route,
          method,
          attempt,
          durationMs,
          outcome: 'retry',
        });
        continue;
      }

      logProviderEvent({
        provider,
        operation,
        route,
        method,
        attempt,
        durationMs,
        outcome: 'error',
      });

      if (timedOut) {
        throw apiError.providerTimeout(
          `${provider} ${operation} timed out.`,
          { provider, operation, timeoutMs },
        );
      }

      throw apiError.providerUnavailable(
        `${provider} ${operation} failed.`,
        {
          provider,
          operation,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  throw apiError.providerUnavailable(`${provider} ${operation} failed.`);
}

export async function withProviderTimeout<T>(args: {
  provider: ProviderName;
  operation: string;
  route?: string;
  timeoutMs?: number;
  task: () => Promise<T>;
}) {
  const timeoutMs = args.timeoutMs ?? PROVIDER_TIMEOUTS[args.provider];
  const startedAt = Date.now();

  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(
        apiError.providerTimeout(`${args.provider} ${args.operation} timed out.`, {
          provider: args.provider,
          operation: args.operation,
          timeoutMs,
        }),
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([args.task(), timeoutPromise]);
    logProviderEvent({
      provider: args.provider,
      operation: args.operation,
      route: args.route,
      method: 'SDK',
      attempt: 1,
      durationMs: Date.now() - startedAt,
      outcome: 'success',
    });
    return result;
  } catch (error) {
    logProviderEvent({
      provider: args.provider,
      operation: args.operation,
      route: args.route,
      method: 'SDK',
      attempt: 1,
      durationMs: Date.now() - startedAt,
      outcome: 'error',
    });
    throw error;
  }
}
