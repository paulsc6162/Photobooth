// Netlify Function: the booth sends each accepted photo here.
// Stores the photo + a small thumbnail in Supabase and returns the photo's id,
// which the tablet turns into a QR code. Photos (and party galleries) last KEEP_DAYS (default 7).
//
// Body: { image: base64 JPEG, thumb: base64 JPEG, party?: { id, name }, inGallery?: boolean }
//   or  { action: 'party', party: { id, name } }  – creates/renames the party gallery when the host sets it up
import { json, db, upload, randomId, ID_RE, KEEP_DAYS } from '../lib/shared.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });
  const boothKey = (process.env.BOOTH_KEY || '').trim();          // ignore stray spaces from copy-and-paste
  if (!boothKey || (req.headers.get('x-booth-key') || '').trim() !== boothKey) {
    console.error('Upload refused: booth key missing or does not match BOOTH_KEY');
    return json(401, { ok: false, error: 'Unauthorised' });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'Bad JSON' }); }
  const { action, image, thumb, party, inGallery = true } = body || {};
  if (party && (!ID_RE.test(party.id || '') || typeof party.name !== 'string')) return json(400, { ok: false, error: 'Bad party' });

  // Host started (or renamed) a party: create the gallery now, so its QR code works before the first photo
  if (action === 'party') {
    if (!party) return json(400, { ok: false, error: 'No party' });
    try { const expires = await ensureParty(party); return json(200, { ok: true, expires }); }
    catch (e) { console.error('Party setup failed', e); return json(502, { ok: false, error: 'Party setup failed' }); }
  }
  if (typeof image !== 'string' || !image) return json(400, { ok: false, error: 'No image' });
  if (image.length > 5_500_000 || (thumb && thumb.length > 500_000)) return json(413, { ok: false, error: 'Image too large' });

  try {
    // Party photos last as long as their gallery; other photos last KEEP_DAYS from now
    const expires = party ? await ensureParty(party) : new Date(Date.now() + KEEP_DAYS * 86400e3).toISOString();

    const id = randomId(16);
    const path = `photos/${id}.jpg`, thumbPath = `thumbs/${id}.jpg`;
    await upload(path, Buffer.from(image, 'base64'));
    if (thumb) await upload(thumbPath, Buffer.from(thumb, 'base64'));
    await db('POST', 'booth_photos', '', {
      id, party_id: party ? party.id : null, in_gallery: !!(party && inGallery),
      path, thumb_path: thumb ? thumbPath : path, expires_at: expires
    });
    return json(200, { ok: true, id, expires });
  } catch (e) {
    console.error('Upload failed', e);
    return json(502, { ok: false, error: 'Upload failed' });   // full detail is in Netlify's function logs
  }
};

// Create the party gallery if it's new (lasting KEEP_DAYS), or update its title. Returns its expiry time.
async function ensureParty(party) {
  const name = party.name.trim().slice(0, 40);
  const [existing] = await db('GET', 'booth_parties', `?id=eq.${party.id}&select=id,name,expires_at`);
  if (!existing) {
    const expires = new Date(Date.now() + KEEP_DAYS * 86400e3).toISOString();
    await db('POST', 'booth_parties', '', { id: party.id, name, expires_at: expires });
    return expires;
  }
  if (existing.name !== name) await db('PATCH', 'booth_parties', `?id=eq.${party.id}`, { name });
  return existing.expires_at;
}
