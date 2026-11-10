// Shared helpers for the booth's Netlify functions (Supabase storage + database).
const env = process.env;
export const BUCKET = env.SUPABASE_BUCKET || 'photobooth';
export const KEEP_DAYS = parseInt(env.KEEP_DAYS || '7', 10);
export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });

const sb = () => ({ apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` });
export const publicUrl = path => `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

export async function upload(path, bytes) {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...sb(), 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=604800', 'x-upsert': 'true' }, body: bytes
  });
  if (!r.ok) throw new Error(`Storage upload ${r.status}: ${await r.text()}`);
}
export async function removeFiles(paths) {
  if (!paths.length) return;
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE', headers: { ...sb(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths })
  });
  if (!r.ok) throw new Error(`Storage delete ${r.status}: ${await r.text()}`);
}
// Tiny PostgREST wrapper: db('GET', 'booth_photos', '?id=eq.x')
export async function db(method, table, query = '', body, prefer = 'return=minimal') {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}${query}`, {
    method, headers: { ...sb(), 'Content-Type': 'application/json', Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`DB ${method} ${table} ${r.status}: ${await r.text()}`);
  return method === 'GET' || prefer.includes('representation') ? r.json() : null;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function randomId(len = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
}
export const ID_RE = /^[A-Za-z0-9]{10,32}$/;
