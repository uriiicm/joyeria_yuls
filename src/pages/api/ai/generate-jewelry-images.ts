// POST /api/ai/generate-jewelry-images
//   { productId, types?: ['product','lifestyle'], estimateOnly?: boolean }
// Con estimateOnly devuelve el costo oficial estimado sin generar nada.
// Sin él, envía las solicitudes a Higgsfield y devuelve los IDs de los trabajos (asíncrono).
import { handler, json, readJson } from '../../../lib/http';
import { assertProductId } from '../../../lib/validation/product';
import { requireAdmin } from '../../../services/auth/auth.service';
import { estimateGeneration, startGeneration } from '../../../services/ai/generation.service';

export const prerender = false;

export const POST = handler(async ({ request }) => {
  await requireAdmin(request);
  const body = await readJson<{ productId?: unknown; types?: unknown; estimateOnly?: unknown }>(request);
  const id = assertProductId(body.productId);

  if (body.estimateOnly === true) return json({ estimate: await estimateGeneration(id, body.types) });

  const product = await startGeneration(id, body.types);
  return json({ product, jobs: product.ai.generationJobs ?? {} }, 202);
});
