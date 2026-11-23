// POST /api/ai/analyze-jewelry { productId } — analiza la foto original con Gemini.
// Guarda la sugerencia y rellena solo los campos vacíos: nunca pisa lo que la administradora editó.
import { handler, json, readJson, ApiError } from '../../../lib/http';
import { assertProductId } from '../../../lib/validation/product';
import { requireAdmin } from '../../../services/auth/auth.service';
import { analyzeJewelryImage } from '../../../services/ai/gemini.service';
import { getProduct, patchProduct } from '../../../services/products/product.service';
import { fetchStoredImage } from '../../../services/storage/r2.service';

export const prerender = false;

export const POST = handler(async ({ request }) => {
  await requireAdmin(request);
  const { productId } = await readJson<{ productId?: unknown }>(request);
  const id = assertProductId(productId);
  const product = await getProduct(id);
  if (!product.images.original) throw new ApiError(400, 'El producto no tiene fotografía original.');
  if (product.ai.analysisStatus === 'analyzing' && Date.now() - product.updatedAt < 90_000) {
    throw new ApiError(409, 'El análisis ya está en curso.', 'in_progress');
  }

  await patchProduct(id, { 'ai/analysisStatus': 'analyzing', 'ai/analysisError': null });

  try {
    const image = await fetchStoredImage(product.images.original.key).catch(() => {
      throw new ApiError(400, 'No se encontró la fotografía en el almacenamiento. Vuelve a subirla.');
    });
    const { analysis, model } = await analyzeJewelryImage(image);

    const fill: Record<string, unknown> = {};
    if (!product.name) fill.name = analysis.name;
    if (product.category === 'Otros') fill.category = analysis.category;
    if (!product.description) fill.description = analysis.description;
    if (!product.apparentMaterial) fill.apparentMaterial = analysis.apparentMaterial;
    if (!product.colors.length) fill.colors = analysis.colors;
    if (!product.stone) fill.stone = analysis.stone;
    if (!product.style) fill.style = analysis.style;
    if (!product.shape) fill.shape = analysis.shape;
    if (!product.features.length) fill.features = analysis.features;

    const updated = await patchProduct(id, {
      ...fill,
      'ai/analysisStatus': 'completed',
      'ai/analysis': analysis,
      'ai/analysisModel': model,
      'ai/analyzedAt': Date.now(),
    });
    return json({ product: updated, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error en el análisis.';
    await patchProduct(id, { 'ai/analysisStatus': 'failed', 'ai/analysisError': message });
    throw err;
  }
});
