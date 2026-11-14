// Supabase Edge Function: private "Design visualiser" (e.g. the timber canopy pictures).
// Paste this whole file into Supabase → Edge Functions → Deploy a new function → Via Editor,
// name it  Canopy-render , and turn OFF "Verify JWT" in its Settings (the CANOPY_KEY password protects it instead).
//
// Secrets (Edge Functions → Secrets) – GEMINI_API_KEY and DB_SECRET_KEY are already there from the booth:
//   CANOPY_KEY            – a password you choose; you type the same one into the page once
//   CANOPY_DAILY_LIMIT    – optional, max pictures per day (default 60) to cap costs
// SUPABASE_URL is provided automatically by Supabase.

const MODELS: Record<string, string> = { pro: 'gemini-3-pro-image', flash: 'gemini-3.1-flash-image' };
const ASPECTS = ['9:16', '2:3', '3:4', '4:5', '1:1', '5:4', '4:3', '3:2', '16:9', '21:9'];
const SIZES = ['1K', '2K', '4K'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-canopy-key, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const sbHeaders = (): Record<string, string> => {
  const k = env('DB_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json' };
  if (!k.startsWith('sb_')) h.Authorization = `Bearer ${k}`;
  return h;
};
async function log(mode: string, ok: boolean, detail = '') {
  try {
    await fetch(`${env('SUPABASE_URL')}/rest/v1/booth_ai_log`, {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ theme: 'canopy', mode, ok, detail: detail || null })
    });
  } catch (_) { /* logging is best-effort */ }
}
async function usedToday(): Promise<number> {
  try {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/booth_ai_log?theme=eq.canopy&ok=eq.true&created_at=gte.${since.toISOString()}&select=id`,
      { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } });
    return parseInt((r.headers.get('content-range') || '*/0').split('/')[1] || '0', 10) || 0;
  } catch { return 0; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, message: 'POST only' });
  if (!env('CANOPY_KEY') || req.headers.get('x-canopy-key') !== env('CANOPY_KEY'))
    return json(401, { ok: false, message: 'Wrong password – check the CANOPY_KEY secret in Supabase.' });

  let body: { images?: unknown; prompt?: unknown; aspect?: unknown; size?: unknown; model?: unknown };
  try { body = await req.json(); } catch { return json(400, { ok: false, message: 'Bad request' }); }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 12000) return json(400, { ok: false, message: 'Please enter a prompt (max 12,000 characters).' });
  const aspect = ASPECTS.includes(String(body.aspect)) ? String(body.aspect) : '4:3';
  const size = SIZES.includes(String(body.size)) ? String(body.size) : '2K';
  const modelKey = String(body.model) in MODELS ? String(body.model) : 'pro';

  const images = Array.isArray(body.images) ? body.images : [];
  if (!images.length || images.length > 10) return json(400, { ok: false, message: 'Add between 1 and 10 images.' });
  const parts: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const im of images as Array<{ mime?: string; data?: string }>) {
    if (!im || typeof im.data !== 'string' || !/^image\/(jpeg|png|webp)$/.test(String(im.mime))) return json(400, { ok: false, message: 'One of the images could not be read.' });
    total += im.data.length;
    parts.push({ inlineData: { mimeType: im.mime, data: im.data } });
  }
  if (total > 18_000_000) return json(400, { ok: false, message: 'The images are too large together – remove one and try again.' });
  parts.push({ text: prompt });

  const limit = parseInt(env('CANOPY_DAILY_LIMIT', '60'), 10);
  if ((await usedToday()) >= limit) return json(429, { ok: false, message: `Daily limit of ${limit} pictures reached – try again tomorrow, or raise CANOPY_DAILY_LIMIT.` });

  const tag = `${modelKey}/${size}/${aspect}`;
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[modelKey]}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env('GEMINI_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: size } }
      })
    });
  } catch (e) {
    await log(tag, false, 'network: ' + String(e));
    return json(502, { ok: false, message: "Google's AI couldn't be reached – please try again." });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ? String(data.error.message).slice(0, 300) : `HTTP ${res.status}`;
    await log(tag, false, `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 250)}`);
    return json(502, { ok: false, message: `Google's AI said: ${msg}` });
  }
  const out = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{ thought?: boolean; text?: string; inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string } }>;
  const imgs = out.filter(p => !p.thought && (p.inlineData || p.inline_data));
  const last = imgs[imgs.length - 1];
  const image = last?.inlineData?.data ?? last?.inline_data?.data;
  const mime = last?.inlineData?.mimeType ?? last?.inline_data?.mime_type ?? 'image/png';
  const note = out.filter(p => !p.thought && p.text).map(p => p.text).join(' ').trim().slice(0, 600);
  if (!image) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'no image';
    await log(tag, false, 'no image: ' + reason);
    return json(422, { ok: false, message: `No picture came back (${reason}).${note ? ' The AI said: ' + note : ''}` });
  }
  await log(tag, true);
  return json(200, { ok: true, image, mime, note });
});
