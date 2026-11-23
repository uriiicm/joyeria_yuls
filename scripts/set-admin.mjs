// Configura la cuenta administradora:
//  1. Asigna el custom claim { admin: true } al usuario (lo exigen las reglas y los endpoints).
//  2. Escribe en .env FIREBASE_SERVICE_ACCOUNT_BASE64 y agrega el UID a ADMIN_UIDS.
//
// Uso:
//   npm run set-admin -- ~/secrets/service-account.json correo@ejemplo.com
//
// La administradora debe cerrar sesión y volver a entrar para que su token incluya el claim.
// El contenido de la cuenta de servicio nunca se imprime en pantalla.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [, , serviceAccountPath, email, flag] = process.argv;
if (!serviceAccountPath || !email) {
  console.error('Uso: npm run set-admin -- <service-account.json> <correo> [--no-env]');
  process.exit(1);
}

const raw = readFileSync(resolve(serviceAccountPath.replace(/^~/, process.env.HOME ?? '~')), 'utf8');
const serviceAccount = JSON.parse(raw);
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
console.log(`✔ ${email} tiene permisos de administradora (UID ${user.uid}).`);

if (flag !== '--no-env') {
  const envPath = resolve('.env');
  let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const setVar = (name, value) => {
    const line = `${name}=${value}`;
    env = new RegExp(`^${name}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${name}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}\n`;
  };
  const current = /^ADMIN_UIDS=(.*)$/m.exec(env)?.[1] ?? '';
  const uids = new Set(current.split(',').map((s) => s.trim()).filter(Boolean));
  uids.add(user.uid);
  setVar('ADMIN_UIDS', [...uids].join(','));
  setVar('FIREBASE_SERVICE_ACCOUNT_BASE64', Buffer.from(JSON.stringify(serviceAccount)).toString('base64'));
  writeFileSync(envPath, env);
  console.log('✔ .env actualizado (ADMIN_UIDS y FIREBASE_SERVICE_ACCOUNT_BASE64).');
}
console.log('→ Cierra sesión y vuelve a entrar en /admin para que el permiso se aplique.');
