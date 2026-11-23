// Compara el costo oficial (POST /estimate/{endpoint-id}) de los modelos soportados.
// No genera imágenes ni consume saldo.
// Uso: npm run hf:estimate -- [URL pública de una foto]

const key = process.env.HIGGSFIELD_API_KEY?.trim();
if (!key || !key.includes(':')) {
  console.error('HIGGSFIELD_API_KEY debe existir en .env con el formato <key-id>:<key-secret>');
  process.exit(1);
}

const image = process.argv[2] ?? 'https://upload.wikimedia.org/wikipedia/commons/3/3f/JPEG_example_flower.jpg';
const prompt = 'Elegant catalog product photograph of the exact jewelry in the reference image, soft cream background, studio lighting.';

const models = {
  'marketing-studio/image': { prompt, image_urls: [image], enhance_prompt: false, quality: 'high', resolution: '2k', aspect_ratio: '1:1' },
  'alibaba/qwen-image-3/edit': { prompt, image_urls: [image], resolution: '2k', aspect_ratio: '1:1', prompt_extend: false, enable_thinking: false },
};

for (const [model, body] of Object.entries(models)) {
  const res = await fetch(`https://api.higgsfield.ai/estimate/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`${model.padEnd(28)} error ${res.status}: ${JSON.stringify(data.detail ?? data)}`);
    continue;
  }
  const usd = Number(data.usd);
  console.log(`${model.padEnd(28)} US$ ${usd.toFixed(4)} por imagen · 100 joyas × 2 = US$ ${(usd * 200).toFixed(2)}`);
}
