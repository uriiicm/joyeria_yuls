// Sesión de la administradora en el navegador + cliente HTTP autenticado.
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { clientAuth } from '../services/firebase/firebase-client.service';

let readyUser: Promise<User | null> | null = null;

function currentUser(): Promise<User | null> {
  return (readyUser ??= new Promise((resolve) => {
    const off = onAuthStateChanged(clientAuth, (user) => {
      off();
      resolve(user);
    });
  }));
}

function toLogin(reason?: 'expired' | 'forbidden') {
  const next = encodeURIComponent(location.pathname + location.search);
  location.replace(`/admin/login?next=${next}${reason ? `&reason=${reason}` : ''}`);
}

/** Bloquea la página hasta confirmar que hay una administradora con sesión. */
export async function requireAdminSession(): Promise<User> {
  const user = await currentUser();
  if (!user) {
    toLogin();
    return new Promise(() => {});
  }
  const token = await user.getIdTokenResult();
  if (token.claims.admin !== true) {
    await signOut(clientAuth);
    toLogin('forbidden');
    return new Promise(() => {});
  }
  document.documentElement.dataset.auth = 'ready';
  return user;
}

export async function logout() {
  await signOut(clientAuth);
  location.replace('/admin/login');
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** fetch con `Authorization: Bearer <ID token>`; renueva el token una vez si expiró. */
export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const user = await currentUser();
  if (!user) {
    toLogin('expired');
    throw new ApiRequestError(401, 'Sesión expirada.');
  }
  const token = await user.getIdToken(retried);
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiRequestError(0, 'Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (res.status === 401 && !retried) return api<T>(path, init, true);
  if (res.status === 401) {
    toLogin('expired');
  }
  if (!res.ok) throw new ApiRequestError(res.status, data.error ?? `Error ${res.status}`, data.code);
  return data as T;
}
