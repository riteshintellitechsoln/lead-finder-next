// Wraps an API route handler with JSON responses and error handling
export function handle(fn) {
  return async (request, context) => {
    try {
      const result = await fn(request, context);
      return result instanceof Response ? result : Response.json(result);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return Response.json(
        { error: status === 500 ? 'Something went wrong on the server. Check the server console.' : err.message },
        { status }
      );
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
