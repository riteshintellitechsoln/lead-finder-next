// Wraps an API route handler with JSON responses and error handling
export function handle(fn) {
  return async (request, context) => {
    try {
      const result = await fn(request, context);
      return result instanceof Response ? result : Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      // The browser gave up on this request (filters changed); nobody reads the answer
      if (err?.name === 'AbortError' || request.signal?.aborted || /interrupt/i.test(err?.message || '')) {
        return Response.json({ error: 'Request cancelled' }, { status: 499 });
      }
      const status = err.status || 500;
      if (status === 500) console.error(`[api] ${request.method} ${request.nextUrl?.pathname}:`, err);
      const msg = status === 500
        ? (/out of memory/i.test(err?.message || '')
          ? 'The server is busy (out of memory). Try a narrower search.'
          : 'Something went wrong on the server. Check the server console.')
        : err.message;
      return Response.json({ error: msg }, { status });
    }
  };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const toInt = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
