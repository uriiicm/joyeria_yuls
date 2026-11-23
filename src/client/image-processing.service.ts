// Preparación de fotografías en el navegador: valida, corrige orientación, redimensiona y comprime.

export const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_SIDE = 2048;
const QUALITY = 0.86;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  contentType: 'image/jpeg';
}

export class ImageValidationError extends Error {}

export async function prepareImage(input: Blob): Promise<PreparedImage> {
  if (!input.type.startsWith('image/')) throw new ImageValidationError('El archivo no es una imagen.');
  if (input.size > MAX_INPUT_BYTES) throw new ImageValidationError('La imagen es demasiado pesada (máximo 30 MB).');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageValidationError('No se pudo leer la imagen. Si es HEIC, cámbiala a JPG o toma la foto desde aquí.');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new ImageValidationError('No se pudo comprimir la imagen.');
  return { blob, width, height, contentType: 'image/jpeg' };
}
