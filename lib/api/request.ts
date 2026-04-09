export function searchParamsToObject(searchParams: URLSearchParams) {
  const result: Record<string, string | string[]> = {};

  for (const [key, value] of searchParams.entries()) {
    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
      continue;
    }

    if (Array.isArray(existing)) {
      existing.push(value);
      result[key] = existing;
      continue;
    }

    result[key] = [existing, value];
  }

  return result;
}

export function readIdempotencyKey(request: Request) {
  return (
    request.headers.get('idempotency-key')?.trim() ||
    request.headers.get('x-idempotency-key')?.trim() ||
    null
  );
}
