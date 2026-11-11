// Supabase Edge Function: "AI theme it" for the Serendipity photo booth.
// Paste this whole file into Supabase → Edge Functions → Deploy a new function → Via Editor,
// name it  Ai-theme , and turn OFF "Verify JWT" in the function's settings (the booth key protects it instead).
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
  hollywood:  { scene: 'a red-carpet film premiere', background: 'a red carpet with velvet ropes, a glamorous premiere backdrop and a crowd of paparazzi photographers with camera flashes going off', outfit: 'red-carpet evening wear – glamorous gowns and sharp black-tie tuxedos' },
  vip:        { scene: 'an exclusive VIP party', background: 'an exclusive VIP nightclub lounge with velvet ropes, neon lights, champagne on ice and a glittering city view through the windows', outfit: 'sleek designer party outfits – sharp blazers, chic black dresses and statement jewellery' },
  gatsby:     { scene: 'a glamorous 1920s Great Gatsby cocktail bar', background: 'an opulent 1920s art-deco cocktail bar with gold details, mirrored shelves of bottles, cocktail glasses and a jazz band in the background', outfit: '1920s party outfits – beaded flapper dresses with headbands and pearls, and tuxedos with bow ties' },
  casino:     { scene: 'a glamorous casino night', background: 'a luxurious casino with roulette wheels, card tables, crystal chandeliers and gold accents', outfit: 'black-tie casino glamour – tuxedos and elegant evening gowns' },
  movieset:   { scene: 'a big Hollywood movie set', background: 'a busy film studio set with a clapperboard, film cameras, studio lights and a director\'s chair', outfit: 'glamorous leading-role film costumes in classic 1940s Hollywood style' },
  fashion:    { scene: 'a catwalk fashion show', background: 'the end of a high-fashion catwalk with bright runway lights, photographers and a glamorous front-row audience', outfit: 'bold high-fashion couture runway outfits' },
  riviera:    { scene: 'a sunny Italian Riviera holiday', background: 'a sunlit Amalfi Coast terrace with lemon trees, colourful cliffside houses and a sparkling blue sea', outfit: 'elegant 1960s Italian Riviera summer clothes – linen shirts, sundresses, light suits and sunglasses pushed up on the head' },
  venetian:   { scene: 'a Venetian masquerade ball', background: 'a candlelit Venetian palazzo ballroom overlooking the Grand Canal with gondolas outside', outfit: 'ornate Venetian masquerade costumes – rich brocade gowns and tailcoats, with decorative masks held on a stick beside the face so the face stays fully visible' },
  rome:       { scene: 'Ancient Rome', background: 'the Roman Forum in its golden age with marble columns, temples and a sunny blue sky', outfit: 'Ancient Roman togas and stolas with gold laurel wreaths' },
  regency:    { scene: 'a Regency-era ball', background: 'an elegant Regency ballroom in a stately English country house with candlelit chandeliers and pastel walls', outfit: 'Regency fashion – empire-waist gowns with long gloves, and tailcoats with cravats' },
  royal:      { scene: 'a royal palace ball', background: 'a grand royal palace ballroom with marble columns, golden mirrors and crystal chandeliers', outfit: 'regal royal-ball attire – ball gowns, jewelled tiaras and crowns, and ceremonial jackets with sashes' },
  wedding:    { scene: 'an elegant wedding celebration', background: 'a romantic wedding venue with white flowers, fairy lights and a floral arch', outfit: 'smart wedding-guest outfits – suits with flower buttonholes and elegant dresses with fascinators' },
  nyc:        { scene: 'a New York City street', background: 'a busy New York City street with yellow taxis, skyscrapers and bright Times Square lights', outfit: 'stylish New York street fashion – smart coats, trainers and city-chic layers' },
  whitehouse: { scene: 'a visit to the White House', background: 'the White House in Washington DC, seen across the green lawn on a sunny day', outfit: 'smart formal business attire – tailored suits and elegant dresses' },
  coffee:     { scene: 'a trendy coffee shop', background: 'a stylish, trendy coffee shop with exposed brick, hanging plants, Edison bulbs and a gleaming espresso machine', outfit: 'relaxed trendy outfits – chunky knitwear, denim and smart-casual layers' },
  tropical:   { scene: 'a tropical beach party', background: 'a white-sand tropical beach with palm trees, turquoise water and a golden sunset', outfit: 'colourful tropical beach-party outfits – Hawaiian shirts, flower leis and summer dresses' },
  fantasy:    { scene: 'an epic medieval fantasy kingdom', background: 'the great hall of a stone castle with banners, flaming torches and a carved wooden throne, with a dragon flying past the tall window', outfit: 'original medieval fantasy outfits – fur-trimmed cloaks, leather and chainmail armour, and flowing noble gowns, with no recognisable characters or house emblems' },
  pirates:    { scene: 'a pirate adventure', background: 'the deck of a wooden pirate ship on a turquoise sea, with billowing sails and a treasure island in the distance', outfit: 'pirate outfits – tricorn hats, bandanas, billowing shirts, waistcoats and boots' },
  wildwest:   { scene: 'a Wild West saloon', background: 'a dusty Wild West town street with a wooden saloon and desert hills at sunset', outfit: 'Wild West cowboy and cowgirl outfits – cowboy hats, waistcoats, bandanas and boots' },
  disco:      { scene: 'a 1970s disco night', background: 'a 1970s disco dance floor with a mirror ball, colourful lights and a light-up floor', outfit: '1970s disco outfits – sequins, wide collars, flared trousers and glitter' },
  christmas:  { scene: 'a cosy Christmas celebration', background: 'a cosy festive living room with a decorated Christmas tree, fairy lights, a fireplace and wrapped presents', outfit: 'festive Christmas outfits – cosy Christmas jumpers and Santa hats' },
  winter:     { scene: 'a magical winter wonderland', background: 'a snowy winter wonderland forest with twinkling lights and gently falling snow', outfit: 'stylish winter clothes – smart wool coats, knitted scarves and bobble hats' },
  space:      { scene: 'an outer-space adventure', background: 'the inside of a spaceship window looking out at Earth, stars and a colourful nebula', outfit: 'white astronaut space suits with mission patches (helmets off so faces are fully visible)' },
  underwater: { scene: 'a magical under-the-sea world', background: 'a bright coral reef under the sea with tropical fish, sunbeams and bubbles', outfit: 'shimmering ocean-themed party outfits in sea blues and silvers, with pearls and shell accessories' },
  superhero:  { scene: 'a superhero team photo', background: 'a dramatic city skyline at night with searchlights in the sky', outfit: 'original superhero costumes with capes in bold colours, with faces left uncovered and no logos or recognisable characters' }
};

// "Be the star": the people become (fictional) stars – never look-alikes of real celebrities.
const ROLES: Record<string, string> = {
  moviestar:  'a glamorous movie star in red-carpet evening wear and sunglasses',
  rockstar:   'a rock star in a leather jacket, studs and a band-style T-shirt with no real band names',
  popdiva:    'a pop diva in a sparkling sequinned stage outfit with a headset microphone',
  royalty:    'royalty with a crown or tiara, an ermine-trimmed robe and a royal sash',
  sports:     'a sports champion in a bold team kit with no real club badges or logos, wearing a gold winner\'s medal',
  robot:      'a futuristic robot in a sleek chrome and white armoured suit with glowing blue light panels, with the face left fully visible and human',
  supermodel: 'a supermodel in a striking high-fashion designer look'
};

const KEEP = 'Keep every person exactly as they are: the same faces, facial features, expressions, skin tones, hair, body shapes, poses and positions, so everyone is instantly recognisable. Do not add or remove people. Keep the same framing and composition. Photorealistic, natural lighting that matches the scene. Do not add any text, words, logos or watermarks.';

// "More AI": extra touches applied on top of an already-themed photo.
const FACES = 'Keep every person\'s face, facial features, expressions and identity exactly the same so everyone is instantly recognisable, and keep the same poses, positions, framing and composition. Photorealistic. Do not add any text, words, logos or watermarks.';
const NO_NEW_PEOPLE = 'Do not add or remove people.';
type Theme = { scene: string; background: string; outfit: string };
const EXTRAS: Record<string, (t: Theme, roles: string[]) => string> = {
  day:       () => `Edit this photo: change the time of day to a bright, sunny daytime with natural daylight on the scene and the people. Keep the setting, the people and their clothes the same. ${NO_NEW_PEOPLE} ${FACES}`,
  night:     () => `Edit this photo: change the time of day to night-time – a dark evening sky, glowing lights and atmospheric evening lighting on the people. Keep the setting, the people and their clothes the same. ${NO_NEW_PEOPLE} ${FACES}`,
  crowd:     () => `Edit this photo: add a few extra party guests in the background, dressed to suit the scene and enjoying themselves, standing behind the main people and never covering them. The extra guests must be ordinary, unrecognisable people – not real celebrities. Keep the main people and their clothes exactly as they are. ${FACES}`,
  newbg:     (t) => `Edit this photo: replace the background with a fresh, different view of ${t.background} – a new angle or a different spot in the same setting. Leave the people, including their clothes, completely unchanged. ${NO_NEW_PEOPLE} ${FACES}`,
  newoutfit: (t, roles) => `Edit this photo: give every person a different outfit in the same theme – ${roles.length ? roles.map(r => ROLES[r]).join('; ') : t.outfit} – clearly different from what they are wearing now. Leave the background completely unchanged. ${NO_NEW_PEOPLE} ${FACES}`,
  tan:       () => `Edit this photo: give every person a subtle, natural-looking holiday glow – a light, warm sun-kissed tan. Keep each person's own natural skin tone clearly recognisable; this is only a gentle warm glow. Change nothing else. ${NO_NEW_PEOPLE} ${FACES}`,
  longhair:  () => `Edit this photo: give every person long, flowing, glossy hair in their own natural hair colour, styled to suit them. Change nothing else. ${NO_NEW_PEOPLE} ${FACES}`,
  fit:       () => `Edit this photo: give every adult a fit, toned, athletic build – strong shoulders and arms – while keeping them fully dressed in the same outfits, with nothing revealing. Leave any children exactly as they are. Change nothing else. ${NO_NEW_PEOPLE} ${FACES}`,
  model:     () => `Edit this photo: give every person a glamorous model makeover – professionally styled hair, polished make-up or grooming, and flattering magazine-cover lighting – while their faces stay clearly the same people. Keep their clothes and the background. ${NO_NEW_PEOPLE} ${FACES}`
};

function prompt(mode: string, t: Theme, roles: string[] = []) {
  if (mode === 'background')
    return `Edit this photo: replace only the background behind the people with ${t.background}. Leave the people – including their clothes – completely unchanged. ${KEEP}`;
  if (mode === 'clothing')
    return `Edit this photo: change only what every person is wearing to ${t.outfit}. Leave the background completely unchanged. ${KEEP}`;
  if (mode === 'star') {
    const looks = roles.map(r => ROLES[r]).join('; ');
    const share = roles.length > 1
      ? `Share these star looks out among the people (if there are more people than looks, repeat them; if there is only one person, pick the look that suits them best): ${looks}.`
      : `Dress every person as ${looks}.`;
    return `Edit this photo so the people look like famous stars – the scene is ${t.scene}: replace the background with ${t.background}, with a glamorous celebrity atmosphere – spotlights and camera flashes. ${share} They are the stars themselves – do not make anyone resemble a real celebrity and do not add any famous people. ${KEEP}`;
  }
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

  let body: { image?: string; theme?: string; mode?: string; aspect?: string; roles?: unknown; extra?: string };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'Bad JSON' }); }
  const { image, theme = '', mode = 'full', aspect = '9:16' } = body;
  const t = THEMES[theme];
  if (!t || !['full', 'background', 'clothing', 'star', 'extra'].includes(mode)) return json(400, { ok: false, error: 'Unknown theme' });
  const roles = Array.isArray(body.roles) ? [...new Set(body.roles.filter((r): r is string => typeof r === 'string' && r in ROLES))] : [];
  if (mode === 'star' && !roles.length) return json(400, { ok: false, error: 'Pick a star' });
  const extra = typeof body.extra === 'string' ? body.extra : '';
  if (mode === 'extra' && !(extra in EXTRAS)) return json(400, { ok: false, error: 'Unknown option' });
  const logMode = mode === 'star' ? `star:${roles.join('+')}` : mode === 'extra' ? `extra:${extra}` : mode;
  const text = mode === 'extra' ? EXTRAS[extra](t, roles) : prompt(mode, t, roles);
  if (typeof image !== 'string' || !image || image.length > 4_000_000) return json(400, { ok: false, error: 'Bad image' });
  if (!['9:16', '2:3', '3:4', '4:5', '1:1', '5:4', '4:3', '3:2', '16:9'].includes(aspect)) return json(400, { ok: false, error: 'Bad aspect' });

  const limit = parseInt(env('AI_DAILY_LIMIT', '300'), 10);
  if ((await usedToday()) >= limit) return json(429, { ok: false, error: 'limit', message: "AI themes are resting for today – please try again tomorrow!" });

  const model = env('GEMINI_MODEL', 'gemini-3.1-flash-image');
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env('GEMINI_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }, { inlineData: { mimeType: 'image/jpeg', data: image } }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: env('AI_IMAGE_SIZE', '1K') } }
      })
    });
  } catch (e) {
    await log(theme, logMode, false, 'network: ' + String(e));
    return json(502, { ok: false, error: 'ai', message: "The AI couldn't be reached – please try again." });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    await log(theme, logMode, false, `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 250)}`);
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
    await log(theme, logMode, false, 'no image: ' + reason);
    return json(422, { ok: false, error: 'noimage', message: "The AI couldn't theme this photo – try a different theme." });
  }
  await log(theme, logMode, true);
  return json(200, { ok: true, image: out, mime });
});
