// @ts-check
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // Por defecto todo se pre-renderiza (panel admin = HTML estático).
  // El catálogo público y los endpoints /api declaran `prerender = false`.
  output: 'static',
  // Servidor Node independiente (Render, VPS o cualquier hosting con Node 22+).
  // Escucha en HOST/PORT; Render define PORT automáticamente.
  adapter: node({ mode: 'standalone' }),
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
      // Monto mínimo del pedido para envío gratis (0 desactiva el aviso).
      PUBLIC_FREE_SHIPPING_MIN: envField.number({ context: 'client', access: 'public', default: 500 }),
      PUBLIC_SITE_URL: envField.string({ context: 'client', access: 'public', optional: true, url: true }),
      // Video del banner principal (MP4, sin sonido). Vacío = solo imagen.
      PUBLIC_HERO_VIDEO_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'https://pub-2ab10bb546734b0eba2646555e5da09e.r2.dev/video/playground-result-1795461109001.mp4',
      }),

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
