// PATCH /api/products/:id — edita campos, disponibilidad o estado (publicar/archivar).
// DELETE /api/products/:id — elimina el producto, su entrada del catálogo y sus imágenes en R2.
import { handler, json, readJson } from '../../../lib/http';
import { assertProductId, parseProductUpdate } from '../../../lib/validation/product';
import { requireAdmin } from '../../../services/auth/auth.service';
import { deleteProduct, updateProductFields } from '../../../services/products/product.service';

export const prerender = false;

export const PATCH = handler(async ({ request, params }) => {
  await requireAdmin(request);
  const id = assertProductId(params.id);
  const fields = parseProductUpdate(await readJson(request));
  const product = await updateProductFields(id, fields);
  return json({ product });
});

export const DELETE = handler(async ({ request, params }) => {
  await requireAdmin(request);
  await deleteProduct(assertProductId(params.id));
  return json({ ok: true });
});
