import { ADMIN_UIDS } from 'astro:env/server';
import { adminAuth } from '../firebase/firebase-admin.service';
import { ApiError } from '../../lib/http';

const allowedUids = new Set(
  ADMIN_UIDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export interface AdminIdentity {
  uid: string;
  email: string | undefined;
}

/**
 * Valida `Authorization: Bearer <Firebase ID token>` y exige que el usuario sea
 * administrador por partida doble: custom claim `admin` y UID en ADMIN_UIDS.
 */
export async function requireAdmin(request: Request): Promise<AdminIdentity> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new ApiError(401, 'Inicia sesión para continuar.', 'unauthenticated');

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(match[1]!, true);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/id-token-expired' || code === 'auth/id-token-revoked') {
      throw new ApiError(401, 'Tu sesión expiró. Vuelve a iniciar sesión.', 'session_expired');
    }
    throw new ApiError(401, 'Sesión inválida. Vuelve a iniciar sesión.', 'unauthenticated');
  }

  if (decoded.admin !== true || !allowedUids.has(decoded.uid)) {
    throw new ApiError(403, 'Esta cuenta no tiene permisos de administración.', 'forbidden');
  }
  return { uid: decoded.uid, email: decoded.email };
}
