// Supabase Edge Function: "AI theme it" for the Serendipity photo booth.
// Paste this whole file into Supabase → Edge Functions → Deploy a new function → Via Editor,
// name it  ai-theme , and turn OFF "Verify JWT" in the function's settings (the booth key protects it instead).
//
// Secrets (Edge Functions → Secrets):
//   GEMINI_API_KEY   – from Google AI Studio (a paid/billing-enabled key)
//   BOOTH_KEY        – the same text as BOOTH_KEY in Netlify / CONFIG.boothKey in index.html
//   AI_DAILY_LIMIT   – optional, max AI edits per day (default 300) to cap costs
//   GEMINI_MODEL     – optional, default gemini-3.1-flash-image
//   AI_IMAGE_SIZE    – optional, "1K" (default, ~5p per photo) or "2K" (sharper, ~8p)
//   DB_SECRET_KEY    – your Supabase secret key (sb_secret_…), used for the daily-limit log
// SUPABASE_URL is provided automatically by Supabase.
//
// The prompts live here (not on the tablet), so the booth can only ask for these approved themes.

const THEMES: Record<string, { scene: string; background: string; outfit: string }> = {
  riviera:    { scene: 'a sunny Italian Riviera holiday', background: 'a sunlit Amalfi Coast terrace with lemon trees, colourful cliffside houses and a sparkling blue sea', outfit: 'elegant 1960s Italian Riviera summer clothes – linen shirts, sundresses, light suits and sunglasses pushed up on the head' },
  gatsby:     { scene: 'a glamorous 1920s Great Gatsby party', background: 'an opulent 1920s art-deco ballroom with gold details, chandeliers and champagne towers', outfit: '1920s party outfits – beaded flapper dresses with headbands and pearls, and tuxedos with bow ties' },
  hollywood:  { scene: 'a Hollywood red-carpet premiere', background: 'a Hollywood red carpet with velvet ropes, spotlights and a glamorous premiere backdrop', outfit: 'red-carpet evening wear – glamorous gowns and sharp black-tie tuxedos' },
  tropical:   { scene: 'a tropical beach party', background: 'a white-sand tropical beach with palm trees, turquoise water and a golden sunset', outfit: 'colourful tropical beach-party outfits – Hawaiian shirts, flower leis and summer dresses' },
  christmas:  { scene: 'a cosy Christmas celebration', background: 'a cosy festive living room with a decorated Christmas tree, fairy lights, a fireplace and wrapped presents', outfit: 'festive Christmas outfits – cosy Christmas jumpers and Santa hats' },
  winter:     { scene: 'a magical winter wonderland', background: 'a snowy winter wonderland forest with twinkling lights and gently falling snow', outfit: 'stylish winter clothes – smart wool coats, knitted scarves and bobble hats' },
  space:      { scene: 'an outer-space adventure', background: 'the inside of a spaceship window looking out at Earth, stars and a colourful nebula', outfit: 'white astronaut space suits with mission patches (helmets off so faces are fully visible)' },
  wildwest:   { scene: 'a Wild West saloon', background: 'a dusty Wild West town street with a wooden saloon and desert hills at sunset', outfit: 'Wild West cowboy and cowgirl outfits – cowboy hats, waistcoats, bandanas and boots' },
  royal:      { scene: 'a royal palace ball', background: 'a grand royal palace ballroom with marble columns, golden mirrors and crystal chandeliers', outfit: 'regal royal-ball attire – ball gowns, jewelled tiaras and crowns, and ceremonial jackets with sashes' },
  disco:      { scene: 'a 1970s disco night', background: 'a 1970s disco dance floor with a mirror ball, colourful lights and a light-up floor', outfit: '1970s disco outfits – sequins, wide collars, flared trousers and glitter' },
  underwater: { scene: 'a magical under-the-sea world', background: 'a bright coral reef under the sea with tropical fish, sunbeams and bubbles', outfit: 'shimmering ocean-themed party outfits in sea blues and silvers, with pearls and shell accessories' },
  superhero:  { scene: 'a superhero team photo', background: 'a dramatic city skyline at night with searchlights in the sky', outfit: 'original superhero costumes with capes in bold colours, with faces left uncovered and no logos or recognisable characters' }
};

const KEEP = 'Keep every person exactly as they are: the same faces, facial features, expressions, skin tones, hair, body shapes, poses and positions, so everyone is instantly recognisable. Do not add or remove people. Keep the same framing and composition. Photorealistic, natural lighting that matches the scene. Do not add any text, words, logos or watermarks.';

function prompt(mode: string, t: { scene: string; background: string; outfit: string }) {
  if (mode === 'background')
    return `Edit this photo: replace only the background behind the people with ${t.background}. Leave the people – including their clothes – completely unchanged. ${KEEP}`;
  if (mode === 'clothing')
    return `Edit this photo: change only what every person is wearing to ${t.outfit}. Leave the background completely unchanged. ${KEEP}`;
  return `Edit this photo into ${t.scene}: replace the background with ${t.background}, and dress every person in ${t.outfit}. ${KEEP}`;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-booth-key, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string, d = '') => Deno.env.get(k) ?? d;
// Uses your secret key (DB_SECRET_KEY, sb_secret_…) if you add one, otherwise Supabase's built-in service key.
const sbHeaders = (): Record<string, string> => {
  const k = env('DB_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  return k.startsWith('sb_') ? { apikey: k, 'Content-Type': 'application/json' }
                             : { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
};
async function log(theme: string, mode: string, ok: boolean, detail = '') {
  try {
    await fetch(`${env('SUPABASE_URL')}/rest/v1/booth_ai_log`, {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ theme, mode, ok, detail: detail.slice(0, 300) || null })
    });
  } catch (_) { /* logging is best-effort */ }
}
async function usedToday(): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/booth_ai_log?ok=eq.true&created_at=gte.${since.toISOString()}&select=id`,
    { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } });
  const range = r.headers.get('content-range') || '';          // e.g. "0-0/123" or "*/0"
  return parseInt(range.split('/')[1] || '0', 10) || 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });
  if (!env('BOOTH_KEY') || req.headers.get('x-booth-key') !== env('BOOTH_KEY')) return json(401, { ok: false, error: 'Unauthorised' });

  let body: { image?: string; theme?: string; mode?: string; aspect?: string };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'Bad JSON' }); }
  const { image, theme = '', mode = 'full', aspect = '9:16' } = body;
  const t = THEMES[theme];
  if (!t || !['full', 'background', 'clothing'].includes(mode)) return json(400, { ok: false, error: 'Unknown theme' });
  if (typeof image !== 'string' || !image || image.length > 4_000_000) return json(400, { ok: false, error: 'Bad image' });
  if (!['9:16', '16:9', '3:4', '4:3', '1:1'].includes(aspect)) return json(400, { ok: false, error: 'Bad aspect' });

  const limit = parseInt(env('AI_DAILY_LIMIT', '300'), 10);
  if ((await usedToday()) >= limit) return json(429, { ok: false, error: 'limit', message: "AI themes are resting for today – please try again tomorrow!" });

  const model = env('GEMINI_MODEL', 'gemini-3.1-flash-image');
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env('GEMINI_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt(mode, t) }, { inlineData: { mimeType: 'image/jpeg', data: image } }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: env('AI_IMAGE_SIZE', '1K') } }
      })
    });
  } catch (e) {
    await log(theme, mode, false, 'network: ' + String(e));
    return json(502, { ok: false, error: 'ai', message: "The AI couldn't be reached – please try again." });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    await log(theme, mode, false, `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 250)}`);
    return json(502, { ok: false, error: 'ai', message: 'The AI is busy right now – please try again in a moment.' });
  }
  // Use the last real (non-"thought") image the model returned
  const parts = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{ thought?: boolean; inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string } }>;
  const imgs = parts.filter(p => !p.thought && (p.inlineData || p.inline_data));
  const last = imgs[imgs.length - 1];
  const out = last?.inlineData?.data ?? last?.inline_data?.data;
  const mime = last?.inlineData?.mimeType ?? last?.inline_data?.mime_type ?? 'image/png';
  if (!out) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'no image';
    await log(theme, mode, false, 'no image: ' + reason);
    return json(422, { ok: false, error: 'noimage', message: "The AI couldn't theme this photo – try a different theme." });
  }
  await log(theme, mode, true);
  return json(200, { ok: true, image: out, mime });
});
