export const CATEGORIES = [
  'Anillos',
  'Collares',
  'Pulseras',
  'Aretes',
  'Dijes',
  'Cadenas',
  'Juegos de joyería',
  'Otros',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const AVAILABILITY = ['available', 'sold_out'] as const;
export type Availability = (typeof AVAILABILITY)[number];

/** Ciclo de vida comercial del producto. */
export const PRODUCT_STATUS = ['draft', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

/** Estado del análisis con Gemini. */
export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

/** Estado global de la generación de imágenes de un producto. */
export type GenerationStatus = 'idle' | 'generating' | 'completed' | 'failed';

export const GENERATED_IMAGE_TYPES = ['product', 'lifestyle'] as const;
export type GeneratedImageType = (typeof GENERATED_IMAGE_TYPES)[number];

/** Estados que devuelve Higgsfield para una solicitud. */
export type HiggsfieldJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled';

export interface StoredImage {
  /** Clave del objeto en el bucket R2. */
  key: string;
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
}

export interface GeneratedImage extends StoredImage {
  /** Miniatura WebP (600 px) para tarjetas y carrito. */
  thumbKey?: string;
  thumbUrl?: string;
  type: GeneratedImageType;
  model: string;
  createdAt: number;
}

export interface GenerationJob {
  type: GeneratedImageType;
  model: string;
  requestId: string;
  statusUrl: string;
  status: HiggsfieldJobStatus;
  estimatedCostUsd: string | null;
  error: string | null;
  submittedAt: number;
  completedAt: number | null;
}

/** Sugerencia de Gemini. Siempre editable: nunca se publica sin revisión. */
export interface JewelryAnalysis {
  category: Category;
  name: string;
  apparentMaterial: string;
  colors: string[];
  stone: string | null;
  style: string;
  shape: string;
  features: string[];
  description: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: Category;
  price: number | null;
  description: string;
  apparentMaterial: string;
  colors: string[];
  stone: string | null;
  style: string;
  shape: string;
  features: string[];
  availability: Availability;
  status: ProductStatus;
  images: {
    original: StoredImage | null;
    generated?: Partial<Record<GeneratedImageType, GeneratedImage>>;
  };
  ai: {
    analysisStatus: AnalysisStatus;
    analysisModel?: string;
    analysisError?: string | null;
    analysis?: JewelryAnalysis;
    analyzedAt?: number;
    generationStatus: GenerationStatus;
    generationJobs?: Partial<Record<GeneratedImageType, GenerationJob>>;
    generationAttempts?: number;
    lastGeneratedAt?: number;
  };
  createdAt: number;
  updatedAt: number;
  publishedAt?: number | null;
}

/** Proyección pública que se escribe en `catalog/{id}`. Solo lo necesario para mostrar. */
export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  category: Category;
  price: number;
  description: string;
  apparentMaterial: string;
  colors: string[];
  stone: string | null;
  style: string;
  features: string[];
  availability: Availability;
  /** URLs para el detalle: las generadas (o la original si aún no hay). */
  images: string[];
  /** Miniaturas en el mismo orden que `images` (para tarjetas y carrito). */
  thumbnails?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Campos que la administradora puede editar. */
export interface ProductEditableFields {
  name: string;
  category: Category;
  price: number | null;
  description: string;
  apparentMaterial: string;
  colors: string[];
  stone: string | null;
  style: string;
  shape: string;
  features: string[];
  availability: Availability;
  status: ProductStatus;
}
