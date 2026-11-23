// Construcción de prompts para Higgsfield. La foto original es siempre la referencia prioritaria.
//  - product:   la joya sola, como protagonista (fotografía de catálogo).
//  - lifestyle: una mujer realista luciendo la joya, con encuadre según la categoría.
import type { Category, GeneratedImageType, Product } from '../../types/product';

type PromptInput = Pick<Product, 'category' | 'apparentMaterial' | 'colors' | 'style' | 'stone'>;

const FIDELITY = `The attached photo shows the exact product and is the primary visual reference.
Reproduce THIS exact piece of jewelry with absolute fidelity: identical shape, structure, proportions,
number and arrangement of stones, design details, engravings, chain links, clasps and original colors.
Do not redesign, simplify, add or remove any element of the jewelry. Do not change its color or metal tone.
No text, no letters, no logos, no watermarks, no price tags, no graphic overlays.`;

function describe(p: PromptInput): string {
  const parts = [
    `Product: ${p.category.toLowerCase()} (jewelry)`,
    p.apparentMaterial && `apparent material: ${p.apparentMaterial}`,
    p.colors.length && `colors: ${p.colors.join(', ')}`,
    p.stone && `decorative element: ${p.stone}`,
    p.style && `style: ${p.style}`,
  ].filter(Boolean);
  return parts.join('; ') + '.';
}

const PRODUCT_SCENE = `Elegant catalog product photograph. Only the jewelry, with no people, hands or mannequins.
The jewelry is centered and is the clear hero of the image, resting on a minimal surface in soft cream,
warm white or blush pink tones. Professional studio lighting, soft diffused light with gentle highlights
and a subtle soft shadow. Clean, minimalist, luxurious, sharp focus on the jewelry, shallow depth of field.
Only change the background, surface, lighting and composition.`;

/** Encuadre de la modelo según el tipo de joya, para que la pieza luzca y se vea completa. */
const WEARING: Record<Category, string> = {
  Anillos:
    'Close-up of an elegant feminine hand wearing the ring on one finger. The hand is relaxed and gracefully posed, natural well-groomed nails with a nude or soft pink manicure. The framing focuses on the hand and the ring; the ring is fully visible and in sharp focus.',
  Collares:
    "Close-up of a woman's neck and upper chest (décolletage) wearing the necklace, cropped from the chin to the upper chest so the full necklace is visible and centered. Bare shoulders or a simple neckline in a neutral or soft pink fabric that does not cover the necklace.",
  Cadenas:
    "Close-up of a woman's neck and upper chest wearing the chain, cropped from the chin to the upper chest so the full chain is visible and centered. Simple neutral neckline that does not cover the chain.",
  Dijes:
    "Close-up of a woman's neck and upper chest wearing the pendant on a fine chain, cropped from the chin to the upper chest, the pendant centered and fully visible.",
  Aretes:
    "Close-up side profile of a woman's ear, jawline and neck wearing the earring, hair gently tucked behind the ear so the earring is fully visible and in sharp focus.",
  Pulseras:
    "Close-up of a woman's wrist and hand wearing the bracelet, the wrist gracefully posed, the full bracelet visible and in sharp focus.",
  'Juegos de joyería':
    "Close-up of a woman wearing the jewelry set, cropped from the ear to the upper chest so every piece of the set is visible.",
  Otros:
    'Close-up of a woman wearing the jewelry piece in its natural position, framed so the piece is fully visible and in sharp focus.',
};

function lifestyleScene(category: Category): string {
  return `Photorealistic luxury jewelry advertising photograph of a real woman wearing the jewelry.
${WEARING[category] ?? WEARING.Otros}
Natural, realistic skin texture and anatomy (correct number of fingers, natural proportions), warm and
flattering soft natural light, elegant and feminine mood, soft blurred background in cream, beige or blush
pink tones. The jewelry is the focal point and must look exactly like the reference: same size relative to
the body, same design, stones and color. Editorial, high-end, tasteful.`;
}

export function buildJewelryPrompt(type: GeneratedImageType, product: PromptInput): string {
  const scene = type === 'product' ? PRODUCT_SCENE : lifestyleScene(product.category);
  return `${FIDELITY}\n\n${describe(product)}\n\n${scene}`;
}

const NEGATIVE_COMMON =
  'text, letters, logo, watermark, price, different jewelry, extra stones, missing stones, deformed jewelry, altered design, color change, blurry';

export const NEGATIVE_PROMPTS: Record<GeneratedImageType, string> = {
  product: `${NEGATIVE_COMMON}, hands, people, mannequin`,
  lifestyle: `${NEGATIVE_COMMON}, extra fingers, deformed hands, distorted anatomy, cartoon, illustration, plastic skin, nudity`,
};
