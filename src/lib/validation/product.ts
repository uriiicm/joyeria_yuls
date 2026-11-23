import { ApiError } from '../http';
import {
  AVAILABILITY,
  CATEGORIES,
  PRODUCT_STATUS,
  type Availability,
  type Category,
  type ProductEditableFields,
  type ProductStatus,
} from '../../types/product';

const ID_RE = /^[A-Za-z0-9_-]{10,40}$/;

export function assertProductId(value: unknown): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new ApiError(400, 'ID de producto inválido.');
  return value;
}

function text(value: unknown, field: string, max: number, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new ApiError(400, `El campo "${field}" es obligatorio.`);
    return '';
  }
  if (typeof value !== 'string') throw new ApiError(400, `El campo "${field}" debe ser texto.`);
  const v = value.trim();
  if (required && !v) throw new ApiError(400, `El campo "${field}" es obligatorio.`);
  if (v.length > max) throw new ApiError(400, `El campo "${field}" admite máximo ${max} caracteres.`);
  return v;
}

function list(value: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, `El campo "${field}" debe ser una lista.`);
  return value
    .slice(0, maxItems)
    .map((v) => text(v, field, maxLen))
    .filter(Boolean);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], field: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    throw new ApiError(400, `Valor inválido para "${field}".`);
  }
  return value as T;
}

export function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value.replace(/[,\s$]/g, '')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10_000_000) {
    throw new ApiError(400, 'El precio debe ser un número positivo.');
  }
  return Math.round(n * 100) / 100;
}

/**
 * Valida una actualización parcial. Solo devuelve los campos presentes.
 * El código, las imágenes y los estados de IA no son editables por esta vía.
 */
export function parseProductUpdate(input: unknown): Partial<ProductEditableFields> {
  if (!input || typeof input !== 'object') throw new ApiError(400, 'Datos inválidos.');
  const body = input as Record<string, unknown>;
  const out: Partial<ProductEditableFields> = {};

  if ('name' in body) out.name = text(body.name, 'nombre', 120, true);
  if ('category' in body) out.category = oneOf<Category>(body.category, CATEGORIES, 'categoría');
  if ('price' in body) out.price = parsePrice(body.price);
  if ('description' in body) out.description = text(body.description, 'descripción', 1200);
  if ('apparentMaterial' in body) out.apparentMaterial = text(body.apparentMaterial, 'material', 120);
  if ('colors' in body) out.colors = list(body.colors, 'colores', 8, 40);
  if ('stone' in body) out.stone = text(body.stone, 'piedra', 160) || null;
  if ('style' in body) out.style = text(body.style, 'estilo', 80);
  if ('shape' in body) out.shape = text(body.shape, 'forma', 120);
  if ('features' in body) out.features = list(body.features, 'características', 12, 120);
  if ('availability' in body) out.availability = oneOf<Availability>(body.availability, AVAILABILITY, 'disponibilidad');
  if ('status' in body) out.status = oneOf<ProductStatus>(body.status, PRODUCT_STATUS, 'estado');

  return out;
}
