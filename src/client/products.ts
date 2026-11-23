// Lectura en vivo de productos para el panel (las reglas solo la permiten a la administradora).
import { onValue, ref } from 'firebase/database';
import { clientDb } from '../services/firebase/firebase-client.service';
import type { Product } from '../types/product';
import { escapeHtml } from './ui';

export function subscribeProducts(cb: (products: Product[]) => void, onError: (e: Error) => void) {
  return onValue(
    ref(clientDb, 'products'),
    (snap) => {
      const list = Object.values((snap.val() ?? {}) as Record<string, Product>).map((p) => ({
        ...p,
        colors: p.colors ?? [],
        features: p.features ?? [],
        images: p.images ?? { original: null },
      }));
      cb(list.sort((a, b) => b.createdAt - a.createdAt));
    },
    onError,
  );
}

export function subscribeProduct(id: string, cb: (p: Product | null) => void, onError: (e: Error) => void) {
  return onValue(
    ref(clientDb, `products/${id}`),
    (snap) => {
      const p = snap.val() as Product | null;
      cb(p ? { ...p, colors: p.colors ?? [], features: p.features ?? [], images: p.images ?? { original: null } } : null);
    },
    onError,
  );
}

export function coverUrl(p: Product): string {
  const g = p.images.generated?.product ?? p.images.generated?.lifestyle;
  return g?.thumbUrl ?? g?.url ?? p.images.original?.url ?? '/placeholder-jewelry.svg';
}

const price = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatPrice = (v: number | null) => (typeof v === 'number' ? price.format(v) : 'Sin precio');

export const STATUS_LABEL = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' } as const;
export const AVAILABILITY_LABEL = { available: 'Disponible', sold_out: 'Agotado' } as const;
export const GENERATION_LABEL = {
  idle: 'Sin imágenes IA',
  generating: 'Generando imágenes…',
  completed: 'Imágenes listas',
  failed: 'Error en imágenes',
} as const;

export function needsProcessing(p: Product): boolean {
  return p.ai.analysisStatus !== 'completed' || p.ai.generationStatus !== 'completed';
}

export function productRow(p: Product): string {
  return `
    <a class="admin-item card" href="/admin/products/edit?id=${encodeURIComponent(p.id)}">
      <img src="${escapeHtml(coverUrl(p))}" alt="" loading="lazy" onerror="this.src='/placeholder-jewelry.svg'" />
      <div>
        <div class="admin-item__title">${escapeHtml(p.name || 'Sin nombre')}</div>
        <div class="admin-item__meta">
          <span>${escapeHtml(p.code)}</span>
          <span>${escapeHtml(formatPrice(p.price))}</span>
          <span class="badge badge--${p.status}">${STATUS_LABEL[p.status]}</span>
          ${p.availability === 'sold_out' ? '<span class="badge badge--sold_out">Agotado</span>' : ''}
          ${p.ai.generationStatus !== 'completed' ? `<span class="badge">${GENERATION_LABEL[p.ai.generationStatus]}</span>` : ''}
        </div>
      </div>
      <span aria-hidden="true" class="muted">›</span>
    </a>`;
}
