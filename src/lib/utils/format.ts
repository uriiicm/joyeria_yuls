import { PUBLIC_CURRENCY } from 'astro:env/client';

const priceFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: PUBLIC_CURRENCY,
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatPrice(value: number | null | undefined): string {
  return typeof value === 'number' ? priceFormatter.format(value) : 'Sin precio';
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
}

export const AVAILABILITY_LABEL = { available: 'Disponible', sold_out: 'Agotado' } as const;
export const STATUS_LABEL = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' } as const;
