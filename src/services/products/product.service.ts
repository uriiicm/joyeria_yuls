import { ServerValue } from 'firebase-admin/database';
import { adminDb } from '../firebase/firebase-admin.service';
import { deletePrefix } from '../storage/r2.service';
import { ApiError } from '../../lib/http';
import {
  GENERATED_IMAGE_TYPES,
  type CatalogItem,
  type Product,
  type ProductEditableFields,
  type StoredImage,
} from '../../types/product';

const productsRef = () => adminDb().ref('products');
const catalogRef = () => adminDb().ref('catalog');

/** Código consecutivo, único e inmutable: JOY-000001, JOY-000002… */
async function nextProductCode(): Promise<string> {
  const result = await adminDb()
    .ref('counters/productCode')
    .transaction((current: number | null) => (current ?? 0) + 1);
  if (!result.committed) throw new Error('No se pudo reservar el código del producto.');
  return `JOY-${String(result.snapshot.val()).padStart(6, '0')}`;
}

export async function createDraftProduct(id: string, original: StoredImage): Promise<Product> {
  const ref = productsRef().child(id);
  const now = Date.now();
  const product: Product = {
    id,
    code: await nextProductCode(),
    name: '',
    category: 'Otros',
    price: null,
    description: '',
    apparentMaterial: '',
    colors: [],
    stone: null,
    style: '',
    shape: '',
    features: [],
    availability: 'available',
    status: 'draft',
    images: { original },
    ai: { analysisStatus: 'pending', generationStatus: 'idle' },
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };
  await ref.set(product);
  return product;
}

export async function getProduct(id: string): Promise<Product> {
  const snap = await productsRef().child(id).get();
  if (!snap.exists()) throw new ApiError(404, 'El producto no existe.');
  return normalize(snap.val() as Product);
}

/**
 * Realtime Database elimina los campos `null` y las listas vacías al guardar.
 * Al leer se restauran sus valores por defecto para no propagar `undefined`
 * (Firebase rechaza escribir `undefined`, p. ej. al copiar al catálogo).
 */
function normalize(p: Product): Product {
  return {
    ...p,
    name: p.name ?? '',
    description: p.description ?? '',
    apparentMaterial: p.apparentMaterial ?? '',
    colors: p.colors ?? [],
    stone: p.stone ?? null,
    style: p.style ?? '',
    shape: p.shape ?? '',
    features: p.features ?? [],
    price: p.price ?? null,
    publishedAt: p.publishedAt ?? null,
    images: { original: p.images?.original ?? null, ...(p.images?.generated ? { generated: p.images.generated } : {}) },
  };
}

/** Escribe campos con rutas relativas (multi-path update) y sincroniza el catálogo. */
export async function patchProduct(id: string, updates: Record<string, unknown>): Promise<Product> {
  await productsRef()
    .child(id)
    .update({ ...updates, updatedAt: ServerValue.TIMESTAMP });
  const product = await getProduct(id);
  await syncCatalog(product);
  return product;
}

export async function updateProductFields(id: string, fields: Partial<ProductEditableFields>): Promise<Product> {
  const current = await getProduct(id);
  const merged = { ...current, ...fields };

  if (fields.status === 'published') {
    if (!merged.name) throw new ApiError(400, 'Agrega un nombre antes de publicar.');
    if (merged.price === null || merged.price <= 0) throw new ApiError(400, 'Asigna un precio mayor a 0 antes de publicar.');
    if (!merged.images.original && !merged.images.generated) {
      throw new ApiError(400, 'El producto necesita al menos una fotografía.');
    }
  }

  const updates: Record<string, unknown> = { ...fields };
  if (fields.status === 'published' && current.status !== 'published') updates.publishedAt = Date.now();
  return patchProduct(id, updates);
}

export async function deleteProduct(id: string): Promise<void> {
  await getProduct(id);
  await deletePrefix(`products/${id}/`);
  await adminDb()
    .ref()
    .update({ [`products/${id}`]: null, [`catalog/${id}`]: null });
}

/**
 * Imágenes públicas: solo las generadas (producto y lifestyle). La foto original
 * se conserva en privado y únicamente se usa como respaldo si aún no hay generadas.
 */
export function catalogImages(p: Product): string[] {
  const generated = GENERATED_IMAGE_TYPES.map((t) => p.images.generated?.[t]?.url).filter(
    (u): u is string => Boolean(u),
  );
  if (generated.length) return generated;
  return p.images.original ? [p.images.original.url] : [];
}

export function catalogThumbnails(p: Product): string[] {
  const generated = GENERATED_IMAGE_TYPES.map((t) => p.images.generated?.[t])
    .filter((g): g is NonNullable<typeof g> => Boolean(g?.url))
    .map((g) => g.thumbUrl ?? g.url);
  if (generated.length) return generated;
  return p.images.original ? [p.images.original.url] : [];
}

function toCatalogItem(p: Product): CatalogItem {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category,
    price: p.price ?? 0,
    description: p.description ?? '',
    apparentMaterial: p.apparentMaterial ?? '',
    colors: p.colors ?? [],
    stone: p.stone ?? null,
    style: p.style ?? '',
    features: p.features ?? [],
    availability: p.availability,
    images: catalogImages(p),
    thumbnails: catalogThumbnails(p),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** El catálogo público es una proyección: solo existe si el producto está publicado. */
export async function syncCatalog(p: Product): Promise<void> {
  const ref = catalogRef().child(p.id);
  if (p.status === 'published' && p.price !== null && p.name) await ref.set(toCatalogItem(p));
  else await ref.remove();
}
