export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function toast(message: string, kind: 'info' | 'error' | 'success' = 'info', ms = 4200) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Desactiva un botón mientras corre una tarea: evita dobles envíos. */
export async function busy<T>(button: HTMLButtonElement | null, task: () => Promise<T>): Promise<T> {
  if (button?.getAttribute('aria-busy') === 'true') return Promise.reject(new Error('busy'));
  button?.setAttribute('aria-busy', 'true');
  try {
    return await task();
  } finally {
    button?.removeAttribute('aria-busy');
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
