import type { APIContext, APIRoute } from 'astro';

/** Error con código HTTP y mensaje apto para mostrarse a la administradora. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'error',
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export async function readJson<T = unknown>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new ApiError(413, 'La solicitud es demasiado grande.');
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, 'El cuerpo de la solicitud no es JSON válido.');
  }
}

/** Envuelve un endpoint: convierte errores en respuestas JSON consistentes. */
export function handler(fn: (ctx: APIContext) => Promise<Response>): APIRoute {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.message, code: err.code }, err.status);
      console.error(`[api] ${ctx.request.method} ${ctx.url.pathname}`, err);
      return json({ error: 'Ocurrió un error inesperado en el servidor.', code: 'internal' }, 500);
    }
  };
}
