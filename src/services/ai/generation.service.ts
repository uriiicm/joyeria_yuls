// Orquesta la generación de las 2 imágenes publicitarias de una joya.
// Flujo asíncrono: start() envía las solicitudes y guarda los IDs; refresh()
// consulta su estado y, cuando terminan, copia los resultados a R2.
import { adminDb } from '../firebase/firebase-admin.service';
import { getProduct, patchProduct } from '../products/product.service';
import { deleteObject, productImageKey, publicUrl, putObject, sniffImageType } from '../storage/r2.service';
import { ApiError } from '../../lib/http';
import {
  GENERATED_IMAGE_TYPES,
  type GeneratedImage,
  type GeneratedImageType,
  type GenerationJob,
  type GenerationStatus,
  type HiggsfieldJobStatus,
  type Product,
} from '../../types/product';
import { buildJewelryPrompt } from './jewelry-prompts';
import {
  ACTIVE_MODEL,
  buildRequestBody,
  downloadResult,
  estimateCost,
  getGenerationStatus,
  submitGeneration,
} from './higgsfield.service';

const TERMINAL: HiggsfieldJobStatus[] = ['completed', 'failed', 'nsfw', 'canceled'];
/** Si una generación lleva más de esto "en curso", se permite reiniciarla. */
const STALE_MS = 45 * 60 * 1000;

function requestBody(product: Product, type: GeneratedImageType) {
  if (!product.images.original) throw new ApiError(400, 'El producto no tiene fotografía original.');
  return buildRequestBody(ACTIVE_MODEL, type, buildJewelryPrompt(type, product), product.images.original.url);
}

function parseTypes(types: unknown): GeneratedImageType[] {
  if (types === undefined) return [...GENERATED_IMAGE_TYPES];
  if (!Array.isArray(types) || !types.length) throw new ApiError(400, 'Tipos de imagen inválidos.');
  const valid = types.filter((t): t is GeneratedImageType => (GENERATED_IMAGE_TYPES as readonly string[]).includes(t));
  if (valid.length !== types.length) throw new ApiError(400, 'Tipos de imagen inválidos.');
  return [...new Set(valid)];
}

export async function estimateGeneration(productId: string, rawTypes?: unknown) {
  const product = await getProduct(productId);
  const types = parseTypes(rawTypes);
  const perImage = await Promise.all(types.map((t) => estimateCost(ACTIVE_MODEL, requestBody(product, t))));
  const totalUsd = perImage.reduce((sum, v) => sum + Number(v), 0);
  return {
    model: ACTIVE_MODEL,
    types,
    perImageUsd: Object.fromEntries(types.map((t, i) => [t, perImage[i]])),
    totalUsd: totalUsd.toFixed(4),
  };
}

/** Reserva el producto para generar. Evita solicitudes duplicadas (doble clic, pestañas). */
async function acquireLock(product: Product): Promise<number> {
  const aiRef = adminDb().ref(`products/${product.id}/ai`);
  let attempt = 0;
  const result = await aiRef.transaction((ai: Product['ai'] | null) => {
    if (!ai) return ai; // aún sin datos locales: el SDK reintenta con el valor real
    const startedAt = Math.max(0, ...Object.values(ai.generationJobs ?? {}).map((j) => j?.submittedAt ?? 0));
    if (ai.generationStatus === 'generating' && Date.now() - startedAt < STALE_MS) return undefined; // aborta
    attempt = (ai.generationAttempts ?? 0) + 1;
    return { ...ai, generationStatus: 'generating', generationAttempts: attempt };
  });
  if (!result.committed) throw new ApiError(409, 'Ya hay una generación en curso para esta joya.', 'in_progress');
  return attempt;
}

export async function startGeneration(productId: string, rawTypes?: unknown) {
  const product = await getProduct(productId);
  const types = parseTypes(rawTypes);
  if (!product.images.original) throw new ApiError(400, 'El producto no tiene fotografía original.');

  const attempt = await acquireLock(product);
  const jobs: Partial<Record<GeneratedImageType, GenerationJob>> = { ...(product.ai.generationJobs ?? {}) };

  // Secuencial a propósito: nunca se disparan muchas solicitudes simultáneas.
  for (const type of types) {
    const body = requestBody(product, type);
    const base = { type, model: ACTIVE_MODEL, submittedAt: Date.now(), completedAt: null } as const;
    try {
      const estimatedCostUsd = await estimateCost(ACTIVE_MODEL, body).catch(() => null);
      const submitted = await submitGeneration(ACTIVE_MODEL, body, `${product.id}-${type}-${attempt}`);
      jobs[type] = {
        ...base,
        requestId: submitted.requestId,
        statusUrl: submitted.statusUrl,
        status: submitted.status,
        estimatedCostUsd,
        error: null,
      };
    } catch (err) {
      jobs[type] = {
        ...base,
        requestId: '',
        statusUrl: '',
        status: 'failed',
        estimatedCostUsd: null,
        error: err instanceof Error ? err.message : 'Error al enviar la solicitud.',
      };
    }
  }

  return patchProduct(product.id, {
    'ai/generationJobs': jobs,
    'ai/generationStatus': overallStatus(jobs, types),
  });
}

function overallStatus(jobs: Partial<Record<GeneratedImageType, GenerationJob>>, active: GeneratedImageType[]): GenerationStatus {
  const list = active.map((t) => jobs[t]).filter((j): j is GenerationJob => Boolean(j));
  if (list.some((j) => !TERMINAL.includes(j.status))) return 'generating';
  return list.every((j) => j.status === 'completed') ? 'completed' : 'failed';
}

/** Consulta Higgsfield y guarda en R2 los resultados terminados. Idempotente. */
export async function refreshGeneration(productId: string): Promise<Product> {
  const product = await getProduct(productId);
  const jobs = { ...(product.ai.generationJobs ?? {}) };
  const pending = GENERATED_IMAGE_TYPES.filter((t) => jobs[t] && !TERMINAL.includes(jobs[t]!.status));
  if (!pending.length) return product;

  const updates: Record<string, unknown> = {};
  const oldKeys: string[] = [];

  for (const type of pending) {
    const job = jobs[type]!;
    try {
      const status = await getGenerationStatus(job.statusUrl);
      if (status.status === 'completed') {
        if (!status.imageUrl) throw new Error('Higgsfield no devolvió ninguna imagen.');
        const bytes = await downloadResult(status.imageUrl);
        const contentType = sniffImageType(bytes);
        if (!contentType) throw new Error('El archivo generado no es una imagen válida.');
        const key = productImageKey(product.id, 'generated', type, contentType);
        await putObject(key, bytes, contentType);

        const image: GeneratedImage = { key, url: publicUrl(key), contentType, type, model: job.model, createdAt: Date.now() };
        const previous = product.images.generated?.[type];
        if (previous?.key) oldKeys.push(previous.key);
        updates[`images/generated/${type}`] = image;
        jobs[type] = { ...job, status: 'completed', completedAt: Date.now(), error: null };
      } else if (TERMINAL.includes(status.status)) {
        const reason =
          status.status === 'nsfw' ? 'Higgsfield marcó la imagen como contenido no permitido.' : status.error ?? 'La generación falló.';
        jobs[type] = { ...job, status: status.status, completedAt: Date.now(), error: reason };
      } else {
        jobs[type] = { ...job, status: status.status };
      }
    } catch (err) {
      // Errores de red/descarga: se deja el trabajo como está para reintentar en la siguiente consulta.
      console.error('[generation] refresh', product.id, type, err);
      jobs[type] = { ...job, error: err instanceof Error ? err.message : 'Error al consultar el estado.' };
    }
  }

  const active = GENERATED_IMAGE_TYPES.filter((t) => jobs[t]);
  const status = overallStatus(jobs, active);
  updates['ai/generationJobs'] = jobs;
  updates['ai/generationStatus'] = status;
  if (status === 'completed') updates['ai/lastGeneratedAt'] = Date.now();

  const updated = await patchProduct(product.id, updates);
  await Promise.all(oldKeys.map((k) => deleteObject(k).catch(() => undefined)));
  return updated;
}
