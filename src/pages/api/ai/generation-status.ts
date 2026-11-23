// GET /api/ai/generation-status?productId=… — consulta Higgsfield, guarda en R2 lo terminado
// y devuelve el estado actual. El panel lo llama periódicamente mientras haya trabajos en curso.
import { handler, json } from '../../../lib/http';
import { assertProductId } from '../../../lib/validation/product';
import { requireAdmin } from '../../../services/auth/auth.service';
import { refreshGeneration } from '../../../services/ai/generation.service';

export const prerender = false;

export const GET = handler(async ({ request, url }) => {
  await requireAdmin(request);
  const product = await refreshGeneration(assertProductId(url.searchParams.get('productId')));
  return json({
    generationStatus: product.ai.generationStatus,
    jobs: product.ai.generationJobs ?? {},
    images: product.images.generated ?? {},
    lastGeneratedAt: product.ai.lastGeneratedAt ?? null,
  });
});
