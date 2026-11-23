// Convierte a WebP optimizado (grande + miniatura) las imágenes generadas que aún
// estén en PNG/JPG y actualiza Realtime Database y el catálogo. Los archivos originales se conservan.
// Uso: npm run images:optimize          (muestra lo que haría)
//      npm run images:optimize -- --apply
import sharp from 'sharp';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const apply = process.argv.includes('--apply');
const env = process.env;
const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString());
initializeApp({ credential: cert(sa), databaseURL: env.PUBLIC_FIREBASE_DATABASE_URL });
const db = getDatabase();
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const base = env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
const put = (Key, Body) =>
  s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key, Body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
const webp = (input, max, quality) =>
  sharp(input).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true });

const products = (await db.ref('products').get()).val() ?? {};
let converted = 0;
for (const p of Object.values(products)) {
  for (const [type, img] of Object.entries(p.images?.generated ?? {})) {
    if (img.thumbUrl && img.contentType === 'image/webp') continue;
    const res = await fetch(img.url);
    if (!res.ok) {
      console.log(`✗ ${p.code} ${type}: no se pudo descargar (${res.status})`);
      continue;
    }
    const input = Buffer.from(await res.arrayBuffer());
    const full = await webp(input, 1600, 82);
    const thumb = await webp(full.data, 600, 78);
    console.log(`${p.code} ${type}: ${(input.length / 1024).toFixed(0)} KB → ${(full.data.length / 1024).toFixed(0)} KB (+ miniatura ${(thumb.data.length / 1024).toFixed(0)} KB)`);
    if (!apply) continue;

    const key = `products/${p.id}/generated/${type}-${Date.now()}.webp`;
    const thumbKey = key.replace(/\.webp$/, '-thumb.webp');
    await put(key, full.data);
    await put(thumbKey, thumb.data);
    await db.ref(`products/${p.id}/images/generated/${type}`).update({
      key, url: `${base}/${key}`, thumbKey, thumbUrl: `${base}/${thumbKey}`,
      contentType: 'image/webp', width: full.info.width, height: full.info.height,
    });
    // La PNG original se conserva en R2 (no se borra) por seguridad.
    converted++;
  }

  // Refresca la proyección pública con las nuevas URLs.
  if (apply && p.status === 'published') {
    const fresh = (await db.ref(`products/${p.id}`).get()).val();
    const gen = ['product', 'lifestyle'].map((t) => fresh.images?.generated?.[t]).filter((g) => g?.url);
    const images = gen.length ? gen.map((g) => g.url) : fresh.images?.original ? [fresh.images.original.url] : [];
    const thumbnails = gen.length ? gen.map((g) => g.thumbUrl ?? g.url) : images;
    await db.ref(`catalog/${p.id}`).update({ images, thumbnails });
  }
}
console.log(apply ? `Listo: ${converted} imágenes convertidas.` : 'Vista previa. Ejecuta con --apply para convertir.');
process.exit(0);
