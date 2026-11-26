// Análisis visual de joyería con Gemini (endpoint REST generateContent, solo servidor).
import { GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, GEMINI_MODEL } from 'astro:env/server';
import { ApiError } from '../../lib/http';
import { CATEGORIES, type Category, type JewelryAnalysis } from '../../types/product';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// El principal tiene poco margen: si se satura, el de respaldo responde en segundos.
const PRIMARY_TIMEOUT_MS = 25_000;
const FALLBACK_TIMEOUT_MS = 40_000;

const SYSTEM_INSTRUCTION = `Eres una asistente de catalogación para una boutique de joyería de fantasía y bisutería fina.
Analizas UNA fotografía y describes únicamente lo que se ve. Respondes en español de México.

Reglas de precisión, obligatorias:
- NO afirmes materiales específicos (oro, plata, acero inoxidable, platino, etc.). Usa "metal de apariencia dorada", "metal de apariencia plateada", "tono oro rosa".
- NO menciones quilataje, pureza, ley, certificados, autenticidad ni marcas.
- NO afirmes que una piedra es natural, preciosa o semipreciosa, ni la identifiques como diamante, zafiro, etc. Usa "piedra de tonalidad azul", "cristales transparentes", "perla de apariencia nacarada".
- Si no hay piedra o elemento decorativo visible, "stone" debe ser una cadena vacía.
- No inventes detalles que no se vean en la foto. Si la foto es poco clara, usa confidence "low".
- "description": 2 o 3 frases comerciales, elegantes y honestas, sin superlativos exagerados ni promesas.
- "name": nombre comercial breve (máximo 6 palabras), sin códigos ni precios.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: [...CATEGORIES] },
    name: { type: 'string' },
    apparentMaterial: { type: 'string' },
    colors: { type: 'array', items: { type: 'string' } },
    stone: { type: 'string', description: 'Cadena vacía si no hay piedra ni elemento decorativo visible.' },
    style: { type: 'string' },
    shape: { type: 'string' },
    features: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['category', 'name', 'apparentMaterial', 'colors', 'stone', 'style', 'shape', 'features', 'description', 'confidence'],
} as const;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { message?: string; status?: string };
}

export interface AnalysisResult {
  analysis: JewelryAnalysis;
  model: string;
}

export async function analyzeJewelryImage(image: { bytes: Uint8Array; contentType: string }): Promise<AnalysisResult> {
  if (!GEMINI_API_KEY) throw new ApiError(503, 'Falta configurar GEMINI_API_KEY en el servidor.', 'not_configured');

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: image.contentType, data: Buffer.from(image.bytes).toString('base64') } },
          { text: 'Analiza esta joya y devuelve el JSON solicitado.' },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  };

  const { res, data, model } = await callWithFallback(JSON.stringify(body));
  if (!res.ok) {
    console.error('[gemini]', res.status, data.error);
    if (res.status === 429) throw new ApiError(429, 'Gemini alcanzó su límite de uso. Espera un momento e intenta de nuevo.');
    if (res.status === 503) throw new ApiError(503, 'Gemini está saturado en este momento. Intenta de nuevo en un minuto.');
    if (res.status === 400 || res.status === 403) throw new ApiError(502, `Gemini rechazó la solicitud: ${data.error?.message ?? res.status}`);
    throw new ApiError(502, 'Gemini devolvió un error. Intenta de nuevo.');
  }
  if (data.promptFeedback?.blockReason) throw new ApiError(422, 'Gemini no pudo analizar esta fotografía.');

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'Gemini devolvió una respuesta que no es JSON válido.');
  }
  return { analysis: sanitize(raw), model: data.modelVersion ?? model };
}

type Call = { res: Response; data: GeminiResponse; model: string };

/** Saturación, cuota agotada o falla temporal de Google: vale la pena otro modelo. */
const isTransient = (status: number) => status === 429 || status === 500 || status === 503;

/** Intenta el modelo principal; si se satura, tarda o agotó la cuota, usa el de respaldo. */
async function callWithFallback(body: string): Promise<Call> {
  const fallback = GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL ? GEMINI_FALLBACK_MODEL : null;
  try {
    const primary = await call(GEMINI_MODEL, body, PRIMARY_TIMEOUT_MS);
    if (!fallback || !isTransient(primary.res.status)) return primary;
    console.warn(`[gemini] ${GEMINI_MODEL} respondió ${primary.res.status}; uso ${fallback}`);
  } catch (err) {
    if (!fallback) throw err;
    console.warn(`[gemini] ${GEMINI_MODEL} falló (${(err as Error).message}); uso ${fallback}`);
  }
  const second = await call(fallback, body, FALLBACK_TIMEOUT_MS);
  if (!isTransient(second.res.status)) return second;
  // Un reintento breve del respaldo antes de rendirse.
  await new Promise((r) => setTimeout(r, 1500 + Math.random() * 500));
  return call(fallback, body, FALLBACK_TIMEOUT_MS);
}

async function call(model: string, body: string, timeoutMs: number): Promise<Call> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY! },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = (err as Error).name === 'TimeoutError';
    throw new ApiError(504, timeout ? 'Gemini tardó demasiado en responder. Intenta de nuevo.' : 'No se pudo conectar con Gemini.');
  }
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  return { res, data, model };
}

/** Defensa extra: valida tipos y limpia términos que las reglas prohíben afirmar. */
function sanitize(raw: unknown): JewelryAnalysis {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, 10) : []);
  const category = (CATEGORIES as readonly string[]).includes(r.category as string) ? (r.category as Category) : 'Otros';
  const confidence = ['low', 'medium', 'high'].includes(r.confidence as string) ? (r.confidence as JewelryAnalysis['confidence']) : 'low';
  return {
    category,
    name: str(r.name, 120),
    apparentMaterial: str(r.apparentMaterial, 120),
    colors: arr(r.colors),
    stone: str(r.stone, 160) || null,
    style: str(r.style, 80),
    shape: str(r.shape, 120),
    features: arr(r.features),
    description: str(r.description, 1200),
    confidence,
  };
}
