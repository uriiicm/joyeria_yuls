// Cliente de la API de Higgsfield (https://docs.higgsfield.ai). Solo servidor.
import { HIGGSFIELD_API_KEY, HIGGSFIELD_MODEL } from 'astro:env/server';
import { ApiError } from '../../lib/http';
import type { GeneratedImageType, HiggsfieldJobStatus } from '../../types/product';
import { NEGATIVE_PROMPTS } from './jewelry-prompts';

const BASE_URL = 'https://api.higgsfield.ai';
const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 15_000;

export type HiggsfieldModel = typeof HIGGSFIELD_MODEL;
export const ACTIVE_MODEL: HiggsfieldModel = HIGGSFIELD_MODEL;

export interface SubmitResult {
  requestId: string;
  statusUrl: string;
  status: HiggsfieldJobStatus;
}

export interface StatusResult {
  status: HiggsfieldJobStatus;
  imageUrl: string | null;
  error: string | null;
}

/** Cuerpo de la solicitud según el modelo. Campos tomados de la documentación oficial. */
export function buildRequestBody(
  model: HiggsfieldModel,
  type: GeneratedImageType,
  prompt: string,
  referenceUrl: string,
): Record<string, unknown> {
  switch (model) {
    case 'marketing-studio/image':
      return {
        prompt,
        image_urls: [referenceUrl],
        enhance_prompt: false,
        quality: 'high',
        resolution: '2k',
        aspect_ratio: '1:1',
      };
    case 'alibaba/qwen-image-3/edit':
      return {
        prompt,
        image_urls: [referenceUrl],
        resolution: '2k',
        aspect_ratio: '1:1',
        prompt_extend: false,
        enable_thinking: false,
        negative_prompt: NEGATIVE_PROMPTS[type],
      };
  }
}

function authHeader(): string {
  const key = HIGGSFIELD_API_KEY?.trim();
  if (!key) throw new ApiError(503, 'Falta configurar HIGGSFIELD_API_KEY en el servidor.', 'not_configured');
  if (!key.includes(':')) {
    throw new ApiError(503, 'HIGGSFIELD_API_KEY debe tener el formato <key-id>:<key-secret>.', 'not_configured');
  }
  return `Key ${key}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Petición con reintentos acotados para 429/5xx (espera progresiva, respeta Retry-After). */
async function request<T>(url: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: authHeader(), Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new ApiError(504, 'No se pudo conectar con Higgsfield.');
    }

    const correlation = res.headers.get('x-correlation-id');
    const data = (await res.json().catch(() => null)) as T & { detail?: unknown };
    if (res.ok) return data;

    const retryable = res.status === 429 || res.status >= 500 || res.status === 423;
    if (retryable && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      if (wait <= MAX_RETRY_WAIT_MS) {
        await sleep(wait + Math.random() * 300);
        continue;
      }
    }

    console.error('[higgsfield]', res.status, correlation, JSON.stringify(data?.detail ?? data));
    throw new ApiError(res.status === 429 ? 429 : 502, higgsfieldMessage(res.status, data?.detail), 'higgsfield_error');
  }
}

function higgsfieldMessage(status: number, detail: unknown): string {
  const text =
    typeof detail === 'string'
      ? detail
      : detail && typeof detail === 'object' && 'message' in detail
        ? String((detail as { message: unknown }).message)
        : '';
  switch (status) {
    case 401:
      return 'Las claves de Higgsfield no son válidas.';
    case 403:
      return `Higgsfield rechazó la solicitud (saldo insuficiente o clave deshabilitada). ${text}`.trim();
    case 404:
      return 'El modelo de Higgsfield no está disponible para esta cuenta.';
    case 422:
    case 400:
      return `Higgsfield rechazó los parámetros: ${text || status}`;
    case 429:
      return 'Higgsfield tiene demasiadas generaciones en cola. Intenta en unos minutos.';
    default:
      return `Higgsfield devolvió un error (${status}). Intenta de nuevo.`;
  }
}

/** Costo estimado oficial en USD (POST /estimate/{endpoint-id}). */
export async function estimateCost(model: HiggsfieldModel, body: Record<string, unknown>): Promise<string> {
  const data = await request<{ usd: string }>(`${BASE_URL}/estimate/${model}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.usd;
}

export async function submitGeneration(
  model: HiggsfieldModel,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<SubmitResult> {
  const data = await request<{ request_id: string; status_url: string; status: HiggsfieldJobStatus }>(
    `${BASE_URL}/${model}`,
    { method: 'POST', body: JSON.stringify(body), idempotencyKey },
  );
  return { requestId: data.request_id, statusUrl: data.status_url, status: data.status };
}

export async function getGenerationStatus(statusUrl: string): Promise<StatusResult> {
  // Solo se consultan URLs del propio API de Higgsfield (evita SSRF con datos guardados).
  if (!statusUrl.startsWith(`${BASE_URL}/requests/`)) throw new Error('URL de estado inesperada.');
  const data = await request<{ status: HiggsfieldJobStatus; images?: { url: string }[]; error?: string }>(statusUrl);
  return { status: data.status, imageUrl: data.images?.[0]?.url ?? null, error: data.error ?? null };
}

/** Descarga el resultado desde el servidor (las URLs de Higgsfield caducan). */
export async function downloadResult(url: string): Promise<Uint8Array> {
  if (!/^https:\/\//.test(url)) throw new Error('URL de resultado no segura.');
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`No se pudo descargar la imagen generada (${res.status}).`);
  const type = res.headers.get('content-type') ?? '';
  if (type && !type.startsWith('image/') && type !== 'application/octet-stream') {
    throw new Error(`El resultado no es una imagen (${type}).`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('La imagen generada es demasiado grande.');
  return bytes;
}
