// Lectura del catálogo público (solo datos de `catalog/`, nunca de `products/`).
import { adminDb } from '../firebase/firebase-admin.service';
import type { CatalogItem } from '../../types/product';

function normalize(item: CatalogItem): CatalogItem {
  const images = item.images ?? [];
  return { ...item, colors: item.colors ?? [], features: item.features ?? [], images, thumbnails: item.thumbnails ?? images };
}

export async function listCatalog(): Promise<CatalogItem[]> {
  const snap = await adminDb().ref('catalog').get();
  const items = Object.values((snap.val() ?? {}) as Record<string, CatalogItem>).map(normalize);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) return null;
  const snap = await adminDb().ref(`catalog/${id}`).get();
  return snap.exists() ? normalize(snap.val() as CatalogItem) : null;
}
