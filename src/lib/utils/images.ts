/** Anchos permitidos (deben coincidir con `imagesConfig.sizes` en astro.config.mjs). */
export const IMAGE_WIDTHS = [400, 800, 1200] as const;

const useVercelOptimizer = import.meta.env.PROD;

/** URL optimizada por la CDN de imágenes de Vercel (en desarrollo devuelve la original). */
export function optimizedImage(url: string, width: (typeof IMAGE_WIDTHS)[number], quality = 75): string {
  if (!useVercelOptimizer) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

export function imageSrcSet(url: string): string {
  return IMAGE_WIDTHS.map((w) => `${optimizedImage(url, w)} ${w}w`).join(', ');
}

export const FALLBACK_IMAGE = '/placeholder-jewelry.svg';
