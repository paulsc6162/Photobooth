// Scheduled Netlify Function – runs daily. Deletes photos (and their thumbnails) whose
// 7 days are up, removes expired party galleries, and trims the AI-theme log to 90 days.
import { db, removeFiles } from '../lib/shared.mjs';

export const config = { schedule: '@daily' };

export default async () => {
  const now = new Date().toISOString();
  let photos = 0;
  for (let round = 0; round < 20; round++) {
    const rows = await db('GET', 'booth_photos', `?expires_at=lt.${now}&select=id,path,thumb_path&limit=500`);
    if (!rows.length) break;
    await removeFiles([...new Set(rows.flatMap(r => [r.path, r.thumb_path]))]);
    await db('DELETE', 'booth_photos', `?id=in.(${rows.map(r => r.id).join(',')})`);
    photos += rows.length;
  }
  await db('DELETE', 'booth_parties', `?expires_at=lt.${now}`);
  // Keep 90 days of AI-theme usage history (for the daily cost cap and popularity stats)
  try { await db('DELETE', 'booth_ai_log', `?created_at=lt.${new Date(Date.now() - 90 * 864e5).toISOString()}`); }
  catch (e) { console.error('AI log cleanup failed', e); }
  console.log(`Cleanup: removed ${photos} expired photos`);
  return new Response('ok');
};
