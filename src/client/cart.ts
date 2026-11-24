// Carrito del visitante. Vive solo en su navegador (localStorage) y termina en un
// mensaje de WhatsApp con el pedido: no hay pagos ni datos personales en el servidor.
// Cada joya es una pieza única: se agrega una sola vez y no tiene cantidades.
import {
  PUBLIC_CURRENCY,
  PUBLIC_FREE_SHIPPING_MIN,
  PUBLIC_STORE_NAME,
  PUBLIC_WHATSAPP_NUMBER,
} from 'astro:env/client';

export interface CartItem {
  id: string;
  code: string;
  name: string;
  price: number;
  image: string;
  url: string;
}

const KEY = 'joyeria-cart-v1';
export const CART_EVENT = 'cart:change';
export const FREE_SHIPPING_MIN = PUBLIC_FREE_SHIPPING_MIN;

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: PUBLIC_CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
export const formatMoney = (n: number) => money.format(n);

function toItem(v: unknown): CartItem | null {
  const i = v as Partial<CartItem>;
  if (!i || typeof i.id !== 'string' || typeof i.name !== 'string' || typeof i.price !== 'number') return null;
  return {
    id: i.id,
    code: String(i.code ?? ''),
    name: i.name,
    price: i.price,
    image: String(i.image ?? '/placeholder-jewelry.svg'),
    url: String(i.url ?? '/'),
  };
}

function read(): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, CartItem>();
    for (const raw of parsed) {
      const item = toItem(raw);
      if (item) unique.set(item.id, item);
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

// Respaldo en memoria por si localStorage no está disponible (modo privado, bloqueos).
let memory: CartItem[] | null = null;
export const currentCart = () => memory ?? (memory = read());

function save(items: CartItem[]) {
  memory = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Se queda solo en memoria durante esta visita.
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: items }));
}

export const isInCart = (id: string) => currentCart().some((i) => i.id === id);

/** Agrega la pieza si aún no está. Devuelve false si ya estaba (es pieza única). */
export function addToCart(item: CartItem): boolean {
  if (isInCart(item.id)) return false;
  save([...currentCart(), item]);
  return true;
}

export const removeFromCart = (id: string) => save(currentCart().filter((i) => i.id !== id));
export const clearCart = () => save([]);

export const cartCount = (items = currentCart()) => items.length;
export const cartTotal = (items = currentCart()) => items.reduce((n, i) => n + i.price, 0);

/** Cuánto falta para el envío gratis (0 si ya aplica o si no hay promoción). */
export const missingForFreeShipping = (items = currentCart()) =>
  FREE_SHIPPING_MIN > 0 ? Math.max(0, FREE_SHIPPING_MIN - cartTotal(items)) : 0;

/** Mensaje de pedido listo para que el cliente solo toque "Enviar" en WhatsApp. */
/** Enlace de la joya con el dominio desde el que el cliente está comprando. */
const productUrl = (item: CartItem) =>
  typeof window !== 'undefined' ? `${window.location.origin}/producto/${encodeURIComponent(item.id)}` : item.url;

export function orderMessage(items = currentCart()): string {
  const total = cartTotal(items);
  const lines = items.map((i, n) => `${n + 1}. ${i.name}\n   Código: ${i.code}\n   Precio: ${formatMoney(i.price)}\n   ${productUrl(i)}`);
  const shipping =
    FREE_SHIPPING_MIN > 0 && total >= FREE_SHIPPING_MIN ? [`✓ Mi pedido supera ${formatMoney(FREE_SHIPPING_MIN)}: aplica envío gratis.`, ''] : [];
  return [
    `Hola ${PUBLIC_STORE_NAME}, quiero realizar el siguiente pedido:`,
    '',
    ...lines,
    '',
    `Total: ${formatMoney(total)} (${items.length} ${items.length === 1 ? 'pieza' : 'piezas'})`,
    '',
    ...shipping,
    '¿Me confirmas disponibilidad y forma de pago? ¡Gracias!',
  ].join('\n');
}

export function orderLink(items = currentCart()): string | null {
  const number = (PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  if (!number || !items.length) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(orderMessage(items))}`;
}

// Sincroniza pestañas abiertas del mismo catálogo.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    memory = read();
    window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: memory }));
  });
}
