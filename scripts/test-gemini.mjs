// Prueba real del análisis con Gemini (mismo prompt y esquema que gemini.service.ts).
// Uso: npm run test:gemini -- ruta/a/foto.jpg
import { readFileSync } from 'node:fs';

const { GEMINI_API_KEY, GEMINI_MODEL = 'gemini-3.6-flash' } = process.env;
const file = process.argv[2];
if (!GEMINI_API_KEY || !file) {
  console.error('Uso: npm run test:gemini -- <foto.jpg>  (requiere GEMINI_API_KEY en .env)');
  process.exit(1);
}

const CATEGORIES = ['Anillos', 'Collares', 'Pulseras', 'Aretes', 'Dijes', 'Cadenas', 'Juegos de joyería', 'Otros'];
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
    category: { type: 'string', enum: CATEGORIES },
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
};

const started = Date.now();
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
  body: JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'image/jpeg', data: readFileSync(file).toString('base64') } },
      { text: 'Analiza esta joya y devuelve el JSON solicitado.' },
    ] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseJsonSchema: RESPONSE_SCHEMA },
  }),
});
const data = await res.json();
if (!res.ok) {
  console.error('Error', res.status, JSON.stringify(data.error ?? data, null, 2));
  process.exit(1);
}
const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
console.log(`Modelo: ${data.modelVersion} · ${Date.now() - started} ms · tokens: ${data.usageMetadata?.totalTokenCount}`);
console.log(JSON.stringify(JSON.parse(text), null, 2));
