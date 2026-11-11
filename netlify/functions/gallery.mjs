// Netlify Function (public, read-only): data for the gallery and photo pages, and the booth slideshow.
//   GET ?g=<partyId>  → { name, expires, photos: [{ id, url, thumb, taken }] }   (newest first)
//   GET ?p=<photoId>  → { url, thumb, expires, party: { id, name } | null }
//   GET ?img=<photoId>[&thumb=1] → redirect straight to the image (used by the photo page to start loading at once)
// Ids are long and random, so only people with the QR code / link can see anything.
import { json, db, publicUrl, ID_RE } from '../lib/shared.mjs';

export default async (req) => {
  const q = new URL(req.url).searchParams, g = q.get('g'), p = q.get('p'), img = q.get('img');

  // Fast path for the photo page: jump straight to the picture in storage (no database lookup).
  // ?img=<id> → full photo, ?img=<id>&thumb=1 → small preview. Expired photos are deleted, so they 404.
  if (img) {
    if (!ID_RE.test(img)) return new Response('Not found', { status: 404 });
    return new Response(null, { status: 302, headers: {
      Location: publicUrl(`${q.get('thumb') ? 'thumbs' : 'photos'}/${img}.jpg`),
      'Cache-Control': 'public, max-age=86400' } });
  }
  const now = new Date().toISOString();
  const gone = () => json(404, { ok: false, error: 'This gallery has expired or does not exist.' });
  try {
    if (g) {
      if (!ID_RE.test(g)) return gone();
      const [party] = await db('GET', 'booth_parties', `?id=eq.${g}&expires_at=gt.${now}&select=id,name,expires_at`);
      if (!party) return gone();
      const rows = await db('GET', 'booth_photos',
        `?party_id=eq.${g}&in_gallery=eq.true&expires_at=gt.${now}&select=id,path,thumb_path,created_at&order=created_at.desc&limit=2000`);
      return json(200, { ok: true, name: party.name, expires: party.expires_at,
        photos: rows.map(r => ({ id: r.id, url: publicUrl(r.path), thumb: publicUrl(r.thumb_path), taken: r.created_at })) },
        { 'Cache-Control': 'no-store' });
    }
    if (p) {
      if (!ID_RE.test(p)) return gone();
      const [ph] = await db('GET', 'booth_photos', `?id=eq.${p}&expires_at=gt.${now}&select=id,path,thumb_path,expires_at,party_id,in_gallery`);
      if (!ph) return gone();
      let party = null;
      if (ph.party_id && ph.in_gallery) {
        const [pt] = await db('GET', 'booth_parties', `?id=eq.${ph.party_id}&select=id,name`);
        if (pt) party = { id: pt.id, name: pt.name };
      }
      return json(200, { ok: true, url: publicUrl(ph.path), thumb: publicUrl(ph.thumb_path), expires: ph.expires_at, party });
    }
    return json(400, { ok: false, error: 'Missing g or p' });
  } catch (e) {
    console.error('Gallery error', e);
    return json(502, { ok: false, error: 'Something went wrong – please try again.' });
  }
};
