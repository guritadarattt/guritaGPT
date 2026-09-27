// title.js
import { generate } from './model.js';

export async function generateTitle(firstMessage) {
  const clean = firstMessage.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Percakapan Baru';

  const fallback = clean.split(' ').slice(0, 6).join(' ').slice(0, 40);

  try {
    const prompt = `Kamu adalah Gurita GPT. Buat judul singkat maksimal 5 kata dalam Bahasa Indonesia untuk percakapan berikut. Hanya tulis judulnya saja tanpa tanda kutip atau penjelasan.

Pesan: ${clean.slice(0, 200)}
Judul:`;

    const raw = await generate(prompt, {
      max_new_tokens: 16,
      temperature: 0.3,
      top_p: 0.9,
    });

    let title = raw.split('Judul:').pop().trim();
    title = title.split('\n')[0].replace(/^["'\-*\s]+|["'\s]+$/g, '').trim();

    if (title.length < 3 || title.length > 60) {
      return fallback;
    }
    return title;
  } catch (err) {
    console.error('[title] fallback:', err.message);
    return fallback;
  }
}