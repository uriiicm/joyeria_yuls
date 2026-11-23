import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { FIREBASE_SERVICE_ACCOUNT_BASE64 } from 'astro:env/server';
import { PUBLIC_FIREBASE_DATABASE_URL } from 'astro:env/client';

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]!);

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 no contiene un JSON válido en base64.');
  }
  app = initializeApp({ credential: cert(serviceAccount), databaseURL: PUBLIC_FIREBASE_DATABASE_URL });
  return app;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getDatabase(adminApp());
