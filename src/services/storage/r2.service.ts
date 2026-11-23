import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  R2_ACCESS_KEY_ID,
  R2_ACCOUNT_ID,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
  R2_SECRET_ACCESS_KEY,
} from 'astro:env/server';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXT: Record<AllowedImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

let client: S3Client | undefined;
function s3(): S3Client {
  return (client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  }));
}

export function isAllowedImageType(value: unknown): value is AllowedImageType {
  return typeof value === 'string' && (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

export function publicUrl(key: string): string {
  return `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
}

/** Claves únicas: nunca se sobrescribe un archivo existente. */
export function productImageKey(productId: string, folder: 'original' | 'generated', name: string, type: AllowedImageType) {
  return `products/${productId}/${folder}/${name}-${Date.now()}.${EXT[type]}`;
}

/** Clave de la miniatura asociada a una imagen (mismo nombre con sufijo -thumb). */
export const thumbKeyFor = (key: string) => key.replace(/(\.[a-z]+)$/, '-thumb$1');

/** URL firmada de corta duración para que el navegador suba un único archivo. */
export async function createUploadUrl(key: string, contentType: AllowedImageType): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }), {
    expiresIn: 600,
  });
}

export async function putObject(key: string, body: Uint8Array, contentType: AllowedImageType): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

/** Borra todos los archivos de un producto. */
export async function deletePrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const page = await s3().send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await s3().send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys } }));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

/** Descarga una imagen ya almacenada (para enviarla a Gemini). */
export async function fetchStoredImage(key: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(publicUrl(key));
  if (!res.ok) throw new Error(`No se pudo leer la imagen ${key} (${res.status}).`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'image/jpeg' };
}

/** Comprueba los "magic bytes" para no confiar solo en el Content-Type. */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: [{ Key: key }] } }));
}
