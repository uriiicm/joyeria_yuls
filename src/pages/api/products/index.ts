// POST /api/products — crea un borrador y devuelve una URL firmada para subir la foto original a R2.
import { handler, json, readJson, ApiError } from '../../../lib/http';
import { requireAdmin } from '../../../services/auth/auth.service';
import { createDraftProduct } from '../../../services/products/product.service';
import { adminDb } from '../../../services/firebase/firebase-admin.service';
import {
  MAX_IMAGE_BYTES,
  createUploadUrl,
  isAllowedImageType,
  productImageKey,
  publicUrl,
} from '../../../services/storage/r2.service';

export const prerender = false;

interface Body {
  contentType?: unknown;
  size?: unknown;
  width?: unknown;
  height?: unknown;
}

const dim = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 20000 ? v : undefined);

export const POST = handler(async ({ request }) => {
  await requireAdmin(request);
  const body = await readJson<Body>(request);

  if (!isAllowedImageType(body.contentType)) throw new ApiError(400, 'Formato no permitido. Usa JPG, PNG o WebP.');
  if (typeof body.size !== 'number' || body.size <= 0 || body.size > MAX_IMAGE_BYTES) {
    throw new ApiError(400, 'La imagen debe pesar menos de 10 MB.');
  }

  // El ID se reserva antes para que la clave del archivo quede bajo products/{id}/.
  const id = adminDb().ref('products').push().key!;
  const key = productImageKey(id, 'original', 'original', body.contentType);
  const uploadUrl = await createUploadUrl(key, body.contentType);
  const width = dim(body.width);
  const height = dim(body.height);
  // RTDB no acepta `undefined`: solo se incluyen las dimensiones conocidas.
  const product = await createDraftProduct(id, {
    key,
    url: publicUrl(key),
    contentType: body.contentType,
    ...(width && height ? { width, height } : {}),
  });

  return json({ product, upload: { url: uploadUrl, contentType: body.contentType } }, 201);
});
