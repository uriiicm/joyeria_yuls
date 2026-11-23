// Regenera `catalog/` a partir de `products/` (solo joyas publicadas con nombre y precio).
// Útil para reparar el catálogo público si una publicación falló a medias.
// Uso: npm run catalog:resync
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const env = process.env;
const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString());
initializeApp({ credential: cert(sa), databaseURL: env.PUBLIC_FIREBASE_DATABASE_URL });
const db = getDatabase();

const TYPES = ['product', 'lifestyle'];
const products = (await db.ref('products').get()).val() ?? {};
const updates = {};
for (const [id, p] of Object.entries(products)) {
  const publishable = p.status === 'published' && typeof p.price === 'number' && p.price > 0 && p.name;
  if (!publishable) {
    updates[`catalog/${id}`] = null;
    continue;
  }
  const gen = TYPES.map((t) => p.images?.generated?.[t]).filter((g) => g?.url);
  const images = gen.length ? gen.map((g) => g.url) : p.images?.original ? [p.images.original.url] : [];
  const thumbnails = gen.length ? gen.map((g) => g.thumbUrl ?? g.url) : images;
  updates[`catalog/${id}`] = {
    id,
    code: p.code,
    name: p.name,
    category: p.category ?? 'Otros',
    price: p.price,
    description: p.description ?? '',
    apparentMaterial: p.apparentMaterial ?? '',
    colors: p.colors ?? [],
    stone: p.stone ?? null,
    style: p.style ?? '',
    features: p.features ?? [],
    availability: p.availability ?? 'available',
    images,
    thumbnails,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? Date.now(),
  };
  console.log(`✓ ${p.code} ${p.name}`);
}
await db.ref().update(updates);
console.log(`Catálogo regenerado: ${Object.values(updates).filter(Boolean).length} joyas publicadas.`);
process.exit(0);
