// Prueba real de Cloudflare R2: sube un archivo con URL firmada (igual que hará
// el navegador), lo lee por la URL pública y lo borra.
// Uso: npm run test:r2

import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL } = process.env;
for (const [k, v] of Object.entries({ R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL })) {
  if (!v) throw new Error(`Falta ${k} en .env`);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const key = `_healthcheck/test-${Date.now()}.txt`;
const body = 'ok';

const uploadUrl = await getSignedUrl(
  s3,
  new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: 'text/plain' }),
  { expiresIn: 300 },
);
const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body });
console.log('1. Subida con URL firmada:', put.status, put.ok ? 'OK' : await put.text());

const pub = await fetch(`${R2_PUBLIC_BASE_URL}/${key}`);
const text = await pub.text();
console.log('2. Lectura pública:', pub.status, text === body ? 'OK' : `contenido inesperado: ${text.slice(0, 80)}`);

await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
console.log('3. Borrado: OK');
