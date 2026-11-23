// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const r2Host = env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).hostname : undefined;

export default defineConfig({
  // Por defecto todo se pre-renderiza (panel admin = HTML estático).
  // El catálogo público y los endpoints /api declaran `prerender = false`.
  output: 'static',
  adapter: vercel({
    imageService: true,
    imagesConfig: {
      sizes: [400, 800, 1200],
      formats: ['image/avif', 'image/webp'],
      domains: r2Host ? [r2Host] : [],
    },
    maxDuration: 60,
  }),
  image: {
    domains: r2Host ? [r2Host] : [],
  },
  env: {
    schema: {
      PUBLIC_FIREBASE_API_KEY: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_FIREBASE_AUTH_DOMAIN: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_FIREBASE_PROJECT_ID: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_FIREBASE_DATABASE_URL: envField.string({ context: 'client', access: 'public', url: true }),
      PUBLIC_FIREBASE_MESSAGING_SENDER_ID: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_FIREBASE_APP_ID: envField.string({ context: 'client', access: 'public' }),

      PUBLIC_STORE_NAME: envField.string({ context: 'client', access: 'public', default: 'Joyería' }),
      PUBLIC_STORE_TAGLINE: envField.string({ context: 'client', access: 'public', default: 'Piezas delicadas para cada momento' }),
      PUBLIC_WHATSAPP_NUMBER: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_CURRENCY: envField.string({ context: 'client', access: 'public', default: 'MXN' }),
      PUBLIC_SITE_URL: envField.string({ context: 'client', access: 'public', optional: true, url: true }),

      FIREBASE_SERVICE_ACCOUNT_BASE64: envField.string({ context: 'server', access: 'secret' }),
      ADMIN_UIDS: envField.string({ context: 'server', access: 'secret' }),

      R2_ACCOUNT_ID: envField.string({ context: 'server', access: 'secret' }),
      R2_BUCKET: envField.string({ context: 'server', access: 'secret' }),
      R2_ACCESS_KEY_ID: envField.string({ context: 'server', access: 'secret' }),
      R2_SECRET_ACCESS_KEY: envField.string({ context: 'server', access: 'secret' }),
      R2_PUBLIC_BASE_URL: envField.string({ context: 'server', access: 'secret', url: true }),

      GEMINI_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GEMINI_MODEL: envField.string({ context: 'server', access: 'secret', default: 'gemini-3.6-flash' }),

      // Formato "<key-id>:<key-secret>", tal como lo muestra Higgsfield Console.
      HIGGSFIELD_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      HIGGSFIELD_MODEL: envField.enum({
        context: 'server',
        access: 'secret',
        values: ['marketing-studio/image', 'alibaba/qwen-image-3/edit'],
        default: 'marketing-studio/image',
      }),
    },
  },
});
