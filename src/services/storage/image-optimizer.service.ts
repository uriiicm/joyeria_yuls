// Convierte las imágenes generadas (PNG de ~2-4 MB) a WebP ligeras para el catálogo:
// una versión grande para el detalle y una miniatura para tarjetas y carrito.
import sharp from 'sharp';

// Limita el uso de memoria/CPU en instancias pequeñas (p. ej. Render Starter, 512 MB).
sharp.cache(false);
sharp.concurrency(1);

export interface OptimizedImage {
  full: { bytes: Uint8Array; width: number; height: number };
  thumb: { bytes: Uint8Array; width: number; height: number };
}

const FULL_MAX = 1600;
const THUMB_MAX = 600;

async function toWebp(input: Uint8Array, max: number, quality: number) {
  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}

export async function optimizeForCatalog(input: Uint8Array): Promise<OptimizedImage> {
  const full = await toWebp(input, FULL_MAX, 82);
  const thumb = await toWebp(full.bytes, THUMB_MAX, 78);
  return { full, thumb };
}
