import { PUBLIC_WHATSAPP_NUMBER } from 'astro:env/client';

/** Enlace wa.me con el mensaje prellenado. Devuelve null si no hay número configurado. */
export function whatsappLink(product: { name: string; code: string }): string | null {
  const number = (PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  if (!number) return null;
  const message = `Hola, me interesa la joya ${product.name}, código ${product.code}. ¿Me puedes dar más información?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function whatsappContactLink(): string | null {
  const number = (PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent('Hola, vi tu catálogo y me gustaría más información.')}`;
}
