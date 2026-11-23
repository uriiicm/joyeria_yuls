# Catálogo digital de joyería

Catálogo público y panel privado para registrar joyas desde el celular. La administradora toma una foto, **Gemini** sugiere sus características y **Higgsfield** genera dos fotografías publicitarias. Los visitantes ven el catálogo y consultan cada pieza por WhatsApp.

| Pieza | Tecnología |
|---|---|
| Framework | Astro 7 + TypeScript (adaptador `@astrojs/node`, servidor independiente) |
| Autenticación | Firebase Authentication (correo y contraseña, una administradora) |
| Base de datos | Firebase Realtime Database |
| Fotografías | Cloudflare R2 (sustituye a Firebase Storage: no requiere plan Blaze) |
| Análisis de fotos | Gemini API (`generateContent`, salida JSON con esquema) |
| Imágenes publicitarias | Higgsfield API (asíncrona, con estimación de costo) |
| Hosting | Render (Web Service, Node 22) |

> **Cambio respecto al plan original:** las fotos se guardan en Cloudflare R2 en lugar de Firebase Storage. Así el proyecto de Firebase puede quedarse en el plan gratuito Spark. Las reglas de seguridad de los archivos se sustituyen por endpoints que validan a la administradora antes de emitir URLs de subida firmadas.

---

## 1. Arquitectura

```
Navegador (catálogo)  ──SSR──▶  Astro (Node) en Render  ──Admin SDK──▶  RTDB  catalog/
Navegador (admin)     ──Bearer ID token──▶  /api/*  ──▶  Gemini · Higgsfield · R2 · RTDB products/
Navegador (admin)     ──PUT con URL firmada──▶  R2 (foto original)
Navegador (admin)     ──SDK cliente (solo lectura)──▶  RTDB products/  (reglas: claim admin)
```

- **Páginas públicas** (`/`, `/producto/[id]`): se renderizan en el servidor con `Cache-Control: s-maxage=60, stale-while-revalidate=600`, que aprovecha cualquier CDN que pongas delante, como Cloudflare. Tienen metadatos SEO, Open Graph y JSON-LD para que se vean bien al compartirse por WhatsApp.
- **Panel `/admin`**: HTML estático (pre-renderizado). La sesión se valida en el navegador y **en cada endpoint**.
- **Endpoints `/api/*`**: los únicos que conocen las claves de Gemini, Higgsfield, R2 y Firebase Admin.

### Estructura

```
src/
  pages/
    index.astro                 Catálogo (SSR)
    producto/[id].astro         Detalle de producto (SSR)
    admin/                      Login, dashboard, lista, alta y edición (estáticas)
    api/
      products/index.ts         POST  crea borrador + URL de subida
      products/[id].ts          PATCH edita/publica · DELETE elimina
      ai/analyze-jewelry.ts     POST  análisis con Gemini
      ai/generate-jewelry-images.ts  POST  estimación o envío a Higgsfield
      ai/generation-status.ts   GET   avance + guardado de resultados en R2
  services/
    firebase/  firebase-admin.service.ts · firebase-client.service.ts
    auth/      auth.service.ts            (requireAdmin)
    storage/   r2.service.ts
    products/  product.service.ts · catalog.service.ts
    ai/        gemini.service.ts · higgsfield.service.ts · jewelry-prompts.ts · generation.service.ts
  client/      sesión, cámara, compresión de imágenes, utilidades del panel
  components/  catalog/ · products/ · ui/
  layouts/     BaseLayout (SEO) · AdminLayout
  lib/         http, validación, formato, WhatsApp, imágenes
  types/       product.ts
firebase/database.rules.json
scripts/       set-admin · test-r2 · compare-higgsfield-models
```

### Modelo de datos (Realtime Database)

```
products/{id}        Registro completo. Solo lo lee y escribe la administradora.
  code               "JOY-000001"  (consecutivo, inmutable)
  name, category, price, description, apparentMaterial, colors[], stone, style, shape, features[]
  availability       available | sold_out
  status             draft | published | archived
  images/original    { key, url, width, height, contentType }
  images/generated/{product|lifestyle}  { key, url, type, model, createdAt }
  ai/analysisStatus  pending | analyzing | completed | failed
  ai/analysis        sugerencia original de Gemini (para consulta)
  ai/generationStatus  idle | generating | completed | failed
  ai/generationJobs/{product|lifestyle}  { requestId, statusUrl, status, model, estimatedCostUsd, error, submittedAt, completedAt }
  ai/generationAttempts, ai/lastGeneratedAt
  createdAt, updatedAt, publishedAt

catalog/{id}         Proyección pública (solo productos publicados con precio).
                     Sin datos de IA, costos ni estados internos.

counters/productCode Contador del código. Solo el servidor.
```

En R2 los archivos quedan así: `products/{id}/original/original-<timestamp>.jpg` y `products/{id}/generated/{product|lifestyle}-<timestamp>.png`. Nunca se sobrescribe un archivo existente y la foto original se conserva siempre.

---

## 2. Requisitos

- Node **22.23.4 o superior**, que es lo que exigen Astro 7 y `firebase-admin` 14. Con nvm: `nvm install 22 && nvm use` (el repositorio incluye `.nvmrc`).
- Una cuenta de Firebase y un proyecto en plan Spark (gratuito).
- Una cuenta de Cloudflare con R2 activado.
- Una API key de Gemini ([Google AI Studio](https://aistudio.google.com/)).
- Una API key de Higgsfield con saldo, en formato `<key-id>:<key-secret>` ([documentación](https://docs.higgsfield.ai/docs/api-reference/overview)).
- Una cuenta de Render para desplegar (Web Service Starter o superior).

```bash
npm install
cp .env.example .env   # y completa los valores (ver sección 9)
```

---

## 3. Firebase

El proyecto actual es `catalogo-joyeria-32gh3`. Para crear uno desde cero:

```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest projects:create <id> --display-name "Catalogo Joyeria"
npx -y firebase-tools@latest apps:create WEB "Catalogo Joyeria Web" --project <id>
npx -y firebase-tools@latest apps:sdkconfig WEB <appId> --project <id>   # valores PUBLIC_FIREBASE_*
```

Actualiza `.firebaserc` con el ID del proyecto.

### 3.1 Realtime Database
La primera instancia solo se puede crear desde la consola: **Compilación → Realtime Database → Crear base de datos**, ubicación `us-central1`, **modo bloqueado**. La URL resultante va en `PUBLIC_FIREBASE_DATABASE_URL`.

### 3.2 Authentication
**Compilación → Authentication → Método de acceso → Correo electrónico/contraseña → Habilitar.**

El registro público no existe en la app. Además, aunque alguien creara una cuenta, no tendría el permiso `admin`.

### 3.3 Cuenta administradora
1. En **Authentication → Usuarios → Agregar usuario**, crea el correo y la contraseña de la administradora.
2. En **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**, descarga el JSON. Guárdalo **fuera del repositorio** (por ejemplo en `~/secrets/`).
3. Ejecuta:
   ```bash
   npm run set-admin -- ~/secrets/service-account.json correo@ejemplo.com
   ```
   El script:
   - asigna el custom claim `admin: true`;
   - agrega el UID a `ADMIN_UIDS`;
   - escribe `FIREBASE_SERVICE_ACCOUNT_BASE64` en `.env` (no imprime el secreto).
4. La administradora cierra sesión y vuelve a entrar.

Los endpoints exigen ambas cosas: el claim `admin` **y** que el UID esté en `ADMIN_UIDS`.

### 3.4 Reglas de seguridad
`firebase/database.rules.json`:
- Todo está cerrado por defecto.
- `catalog/`: lectura pública. Escritura solo con el claim `admin` (en la práctica escribe el servidor).
- `products/`: lectura y escritura solo con el claim `admin`.
- `counters/`: cerrado (solo Admin SDK).

Para desplegarlas:
```bash
npm run deploy:rules
```

Para verificarlas sin sesión:
```bash
curl "$PUBLIC_FIREBASE_DATABASE_URL/products.json"   # → Permission denied
curl "$PUBLIC_FIREBASE_DATABASE_URL/catalog.json"    # → datos públicos o null
```

---

## 4. Cloudflare R2

1. Crea el bucket `joyeria`.
2. **Settings → Public access**: activa el dominio `r2.dev` o conecta un dominio propio (recomendado en producción). Esa URL va en `R2_PUBLIC_BASE_URL`.
3. **R2 → Manage R2 API Tokens → Create API token**, con permiso *Object Read & Write* limitado al bucket. Copia el Access Key ID y el Secret Access Key.
4. **Settings → CORS policy**:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:4321", "https://tu-servicio.onrender.com"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
5. Prueba real: `npm run test:r2`. Sube un archivo con URL firmada, lo lee por la URL pública y lo borra.

---

## 5. Gemini

- Variables: `GEMINI_API_KEY` y `GEMINI_MODEL` (por defecto `gemini-3.6-flash`, estable). Puedes cambiarlo por otro modelo vigente de [la lista oficial](https://aistudio.google.com/docs/models) sin tocar código.
- Llamada: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` con el header `x-goog-api-key`, la imagen en `inlineData` y `responseMimeType: application/json` + `responseJsonSchema`.
- El prompt de sistema prohíbe afirmar materiales, quilataje, pureza, autenticidad, piedras naturales o preciosas y marcas. Además, `sanitize()` valida tipos y longitudes de la respuesta.
- La sugerencia se guarda en `ai/analysis` y solo **rellena campos vacíos**. Nunca pisa lo que la administradora ya editó, y nada se publica sin que ella lo guarde.

---

## 6. Higgsfield

Documentación usada: <https://docs.higgsfield.ai>.

| Concepto | Valor oficial |
|---|---|
| Base URL | `https://api.higgsfield.ai` |
| Autenticación | `Authorization: Key <key-id>:<key-secret>` |
| Envío | `POST /{endpoint-id}`, respuesta `{ status, request_id, status_url, cancel_url }` |
| Estado | `GET /requests/{id}/status`, con estados `queued`, `in_progress`, `completed`, `failed`, `nsfw` y `canceled`; las imágenes llegan en `images[].url` |
| Costo previo | `POST /estimate/{endpoint-id}` con el mismo cuerpo, respuesta `{ "usd": "..." }` |
| Duplicados | header `Idempotency-Key` |
| Límites | `429` con `Retry-After` (cola llena). Lo fallido, `nsfw` o cancelado **no se cobra** |
| Retención | los resultados se borran en 7 días; por eso se copian a R2 |

### Modelos soportados (`HIGGSFIELD_MODEL`)

| Modelo | Por qué | Parámetros enviados |
|---|---|---|
| `marketing-studio/image` (por defecto) | Pensado para fotografía de producto; acepta la foto como referencia | `image_urls:[original]`, `enhance_prompt:false`, `quality:high`, `resolution:2k`, `aspect_ratio:1:1` |
| `alibaba/qwen-image-3/edit` | Modelo de *edición*: modifica la escena partiendo de la imagen | `image_urls:[original]`, `prompt_extend:false`, `enable_thinking:false`, `negative_prompt`, `resolution:2k` |

La documentación de Higgsfield **no garantiza** la fidelidad exacta del producto en ningún modelo. Por eso:
- el prompt (`jewelry-prompts.ts`) exige conservar forma, piedras, proporciones y colores, y cambiar solo fondo, luz y composición;
- se desactiva la reescritura automática del prompt.

Para comparar el costo antes de decidir:
```bash
npm run hf:estimate -- https://<R2_PUBLIC_BASE_URL>/products/<id>/original/<archivo>.jpg
```
Lo recomendable es generar 2 o 3 joyas reales con cada modelo y comparar la fidelidad antes de procesar las 100.

### Flujo y control de costos
1. **Generar imágenes con IA** llama a `/api/ai/generate-jewelry-images` con `estimateOnly: true` y muestra el costo oficial.
2. **Confirmar y generar**:
   - una transacción en RTDB bloquea el producto, lo que impide envíos dobles por doble clic o varias pestañas;
   - se envían 2 solicitudes, de forma secuencial y con `Idempotency-Key = {id}-{tipo}-{intento}`.
3. El panel consulta `/api/ai/generation-status` con espera progresiva (4 a 10 s, máximo 15 min). Esa consulta:
   - descarga cada resultado terminado;
   - valida los *magic bytes* de la imagen;
   - la sube a R2 y actualiza RTDB y el catálogo.
4. **Reintentos ante errores de Higgsfield**: como máximo 3, con espera progresiva y respetando `Retry-After`. Nunca son indefinidos.
5. **Reintentar fallidas** regenera solo las imágenes que fallaron. **Volver a generar** rehace las dos; la imagen anterior se borra de R2 solo cuando la nueva ya está guardada.
6. **Lotes**: en **Joyas** aparece un aviso con las piezas sin imágenes.
   - Se procesan **5 por lote, una a la vez**.
   - El costo total se muestra antes de confirmar.
   - Si Higgsfield responde `429`, el lote espera 30 s.
7. Se registran el modelo, el costo estimado y la fecha de generación de cada trabajo.

---

## 7. Flujo de la administradora

1. Entra a `/admin/login`.
2. Va a **Agregar**, y ahí elige **Tomar foto** (cámara trasera con `getUserMedia`, con cambio de cámara) o **Elegir de la galería**. Si el navegador no permite la cámara, se abre la cámara nativa con `<input capture>`.
3. Ve la vista previa y elige **Repetir** o **Usar esta foto**.
4. La foto se corrige de orientación, se reduce a un máximo de 2048 px y se convierte a JPEG al 86 %.
5. La app crea un borrador con código `JOY-…` y obtiene una URL firmada (10 min). La foto se sube directo a R2.
6. Gemini analiza la foto y la app abre la ficha con los datos sugeridos. Si el análisis falla, la joya y la foto no se pierden: se puede reintentar desde la ficha.
7. La administradora escribe el precio y corrige lo que haga falta.
8. Genera las imágenes con IA (con el costo previo) y elige **Guardar y publicar**.
9. Desde la ficha puede editar, marcar como agotada, ocultar, archivar o eliminar. Eliminar borra el producto, su entrada del catálogo y sus archivos en R2.

---

## 7.1 Carrito y pedidos por WhatsApp

- Cada joya es una **pieza única**: en el detalle, **Agregar al carrito** la agrega una sola vez. Si ya está en el carrito, el botón cambia a "En tu carrito · Ver carrito".
- Al agregar una joya aparece un aviso con dos mensajes: que es pieza única y cuánto falta para el **envío gratis**. El mínimo se configura con `PUBLIC_FREE_SHIPPING_MIN` (por defecto 500; con 0 se desactiva).
- El detalle muestra un aviso real de urgencia: "Pieza única: solo hay una disponible".
- El carrito no tiene cantidades. Cada pieza lleva la etiqueta "Pieza única" y un enlace para quitarla, y arriba hay una barra de progreso hacia el envío gratis.
- El carrito vive solo en el navegador del cliente (`localStorage`, `src/client/cart.ts`). No guarda datos personales en el servidor ni procesa pagos.
- **Realizar pedido** abre `wa.me/<PUBLIC_WHATSAPP_NUMBER>` con el pedido ya escrito: nombre, código, precio y enlace de cada pieza, el total y, si aplica, la nota de envío gratis. El cliente solo toca *Enviar*.
- Las joyas agotadas no se pueden agregar.

## 8. Endpoints

Todos los endpoints `/api/*` requieren `Authorization: Bearer <Firebase ID token>` de la administradora. Las respuestas de error tienen la forma `{ error, code }`.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/products` | `{ contentType, size, width?, height? }` | `201 { product, upload: { url, contentType } }` |
| PATCH | `/api/products/:id` | campos editables y/o `status`, `availability` | `{ product }` |
| DELETE | `/api/products/:id` | — | `{ ok: true }` |
| POST | `/api/ai/analyze-jewelry` | `{ productId }` | `{ product, analysis }` |
| POST | `/api/ai/generate-jewelry-images` | `{ productId, types?, estimateOnly? }` | `{ estimate }` o `202 { product, jobs }` |
| GET | `/api/ai/generation-status?productId=` | — | `{ generationStatus, jobs, images, lastGeneratedAt }` |

Códigos HTTP:
- `401`: sin sesión o sesión expirada (`session_expired`).
- `403`: la cuenta no es administradora.
- `409`: ya hay un proceso en curso.
- `413`: la solicitud es demasiado grande.
- `429`: se alcanzó el límite del proveedor.
- `502/504`: error o *timeout* de Gemini o Higgsfield.
- `503`: falta una clave en el servidor.

Ejemplo de prueba con `curl`. Copia el token de la pestaña *Network* de las herramientas de desarrollo: está en el header `Authorization` de cualquier llamada a `/api`, y dura 1 hora.
```bash
curl -X POST http://localhost:4321/api/ai/generate-jewelry-images \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":"<id>","estimateOnly":true}'
```

---

## 9. Variables de entorno

Ver `.env.example`. El esquema se valida con `astro:env` (`astro.config.mjs`): si falta una variable obligatoria, la app lo indica al arrancar.

| Variable | Dónde se usa | Secreta |
|---|---|---|
| `PUBLIC_FIREBASE_*` | Cliente y servidor | No (identifican el proyecto) |
| `PUBLIC_STORE_NAME`, `PUBLIC_STORE_TAGLINE`, `PUBLIC_WHATSAPP_NUMBER`, `PUBLIC_CURRENCY`, `PUBLIC_SITE_URL` | UI y SEO | No |
| `FIREBASE_SERVICE_ACCOUNT_BASE64`, `ADMIN_UIDS` | Servidor | **Sí** |
| `R2_*` | Servidor | **Sí** (excepto la URL pública) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Servidor | **Sí** |
| `HIGGSFIELD_API_KEY` (`<key-id>:<key-secret>`), `HIGGSFIELD_MODEL` | Servidor | **Sí** |

`PUBLIC_WHATSAPP_NUMBER` va en formato internacional sin `+` ni espacios. Ejemplo para México: `5215512345678`.

---

## 10. Desarrollo, compilación y despliegue

```bash
npm run dev       # http://localhost:4321
npm run check     # tipos
npm run build     # check + build (dist/)
npm start         # arranca el servidor compilado (usa HOST y PORT)
```

> En Astro 7, `astro dev` queda en segundo plano. Para detenerlo usa `npx astro dev stop`, y para ver el registro, `npx astro dev logs`.

### Render
1. **New → Web Service** y conecta el repositorio de GitHub.
2. Configuración:
   | Campo | Valor |
   |---|---|
   | Root Directory | *(vacío)* |
   | Runtime | Node |
   | Build Command | `npm ci && npm run build` |
   | Start Command | `npm start` |
   | Instance Type | Starter o superior. El plan gratuito se apaga tras unos minutos sin visitas |
3. **Environment → Add from .env**: pega todas las variables. `NODE_VERSION=22.23.5` y `HOST=0.0.0.0` son obligatorias; Render define `PORT` solo.
   - `FIREBASE_SERVICE_ACCOUNT_BASE64` va tal cual, en una sola línea.
   - Las variables `PUBLIC_*` se fijan **al compilar**: si cambias alguna, vuelve a desplegar.
4. Después del primer despliegue:
   - pon `PUBLIC_SITE_URL=https://tu-servicio.onrender.com` (o tu dominio) y vuelve a desplegar;
   - agrega ese dominio a la política CORS de R2;
   - en Firebase Console, agrégalo en **Authentication → Configuración → Dominios autorizados**.
5. Cada commit a `main` despliega automáticamente.

### Imágenes
Las imágenes generadas se guardan ya optimizadas en R2: un WebP de hasta 1600 px para el detalle y una miniatura de 600 px para tarjetas y carrito. Por eso no hace falta un servicio de imágenes del hosting. Para convertir imágenes antiguas en PNG:
```bash
npm run images:optimize            # vista previa
npm run images:optimize -- --apply # convierte (conserva los originales)
```

---

## 11. Pruebas de cada integración

| Integración | Cómo probarla |
|---|---|
| Reglas de RTDB | `curl` anónimo a `products.json` (debe responder *Permission denied*) y a `catalog.json` (debe responder) |
| R2 | `npm run test:r2` |
| Login y permisos | Entra con la administradora; prueba con otra cuenta sin claim (debe rechazarla); borra el token del navegador y llama a un endpoint (debe responder `401`) |
| Gemini | `npm run test:gemini -- foto.jpg` (mismo prompt y esquema que la app). Luego agrega una joya: la ficha muestra datos sugeridos y `ai/analysisModel` queda registrado |
| Higgsfield | `npm run hf:estimate` (no gasta saldo). Luego genera las imágenes de una joya y revisa que queden en R2 bajo `generated/` |
| Catálogo | Publica la joya, abre `/` en una ventana privada, entra al detalle y toca **Consultar por WhatsApp** |

---

## 12. Solución de errores frecuentes

| Síntoma | Causa y solución |
|---|---|
| `EnvInvalidVariables … is missing` | Falta una variable en `.env` o en Render |
| Login: "Esa cuenta no tiene permisos" | Ejecuta `npm run set-admin` y vuelve a iniciar sesión |
| `403 forbidden` en endpoints | El UID no está en `ADMIN_UIDS` en el entorno donde corre el servidor (local o Render) |
| La subida de la foto falla en el navegador | CORS de R2 sin el origen actual, o URL firmada vencida (dura 10 min) |
| Fotos rotas en el catálogo | `R2_PUBLIC_BASE_URL` incorrecta o acceso público del bucket desactivado |
| Fotos HEIC de iPhone no se leen | El navegador no decodifica HEIC: usa **Tomar foto** o exporta a JPG |
| La cámara no abre | Requiere HTTPS (o `localhost`) y permiso del navegador; si no, se usa la cámara nativa |
| Gemini `400/403` | API key inválida o modelo no disponible: revisa `GEMINI_MODEL` |
| Higgsfield `403` | Saldo insuficiente o clave deshabilitada |
| Higgsfield `429` | Cola de la cuenta llena: espera y reintenta (el lote ya lo hace) |
| Generación "en curso" para siempre | Abre la ficha para retomar la consulta. A los 45 min se permite reiniciarla |
| Node `EBADENGINE` | Usa Node 22.23.4 o superior (`nvm use`) |
