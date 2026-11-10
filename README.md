# Serendipity Photo Booth

A full-screen photo booth for a portrait-mounted Android tablet, run entirely by customers. There's no email: guests scan a **QR code** to take their photo home, and party photos collect in a private **online gallery for 7 days**.

## How it works

**Guests**
1. **Touch anywhere** on the start screen, then a **5-second countdown** and the photo is taken.
2. The photo shows full screen with four buttons:
   - **↺ Retake**
   - **✨ Glam it**: a soft, flattering filter. Tap again to turn it off.
   - **🪄 AI theme it**: opens the AI screen (see below)
   - **✓ Accept**
3. On **Accept**, the photo is saved, and the buttons are replaced by one QR code titled **"Take it home"**. Guests point their phone camera at it, which opens their photo, and screenshot it to keep it.
4. After 45 seconds, or a tap on **Done**, the booth goes back to the start screen.

**🪄 AI theme it**
1. The guest chooses one of three options:
   - **Theme the entire picture**: new outfits and a new background
   - **Theme the background**: keeps their outfits
   - **Theme the clothing**: keeps the background
2. A grid of 12 theme icons appears: Italian Riviera, 1920s Gatsby, Hollywood, Tropical Beach, Christmas, Winter Wonderland, Space Explorers, Wild West, Royal Ball, 70s Disco, Under the Sea and Superheroes.
3. After about 20 seconds, the booth goes back to the photo screen with the themed picture. The AI button then shows the theme's name.
   - Guests can still tap **Glam it** or **Retake**, try another theme, or choose **Use my original photo**.
   - Each new theme is applied to the **original** photo, so effects never pile up.
   - The party title and the Serendipity strip are added after the AI, so they always look right.
4. If the AI can't do a photo, the guest sees a friendly message and can pick another theme.

**Party hosts**
1. On the start screen, tap **🎉 Hosting a party? Set your photo title**.
2. Enter the **title** (for example "Maria's 50th") and a **4-digit PIN**. That's all.
3. During the party:
   - the title is on **every** photo
   - every photo goes into the **party gallery**
   - when nobody's using the booth, the start screen plays a **slideshow of the gallery**, with **Touch to start** and the **gallery QR code at the bottom**
4. The party ends after **8 hours**, or when the host taps **⚙️ Party settings** → PIN → **End party**. The gallery stays online for **7 days from when the party started**, then everything is deleted automatically.

**Gallery (on guests' phones):** anyone who scans the gallery QR sees every party photo full screen and swipes through them, newest first. If new photos are taken while someone's looking, a "new photos – tap to see" button appears. There are **no download buttons**: guests screenshot the photos they want.

**Without a party:** guests still get their own "Take it home" QR, and the start screen shows the normal Serendipity welcome instead of a slideshow.

## Files
| File | What it does |
|---|---|
| `index.html` | The booth app: camera, countdown, Glam filter, "Take it home" QR code and party slideshow |
| `g.html` | The party gallery: full-screen photos to swipe through |
| `p.html` | The single-photo page that the "Take it home" QR opens |
| `netlify/functions/upload-photo.mjs` | Receives each photo (plus a small thumbnail) from the booth and stores it |
| `netlify/functions/gallery.mjs` | Supplies the photos to the gallery page, photo page and slideshow (read-only) |
| `netlify/functions/cleanup-photos.mjs` | Runs daily and deletes photos and galleries once their 7 days are up |
| `netlify/lib/shared.mjs` | Shared Supabase code |
| `supabase/functions/ai-theme/index.ts` | The "AI theme it" function. It runs on **Supabase**, not Netlify, because AI images take longer than Netlify allows. The AI instructions for every theme are in this file. |
| `supabase-setup.sql` | Creates the storage bucket and the two tables |
| `vendor/qr.js` | Built-in QR code maker (free licence in `vendor/LICENSES.txt`) |
| `fonts/` | Instrument Serif Italic, used for the olive "Serendipity" title (SIL Open Font Licence) |
| `manifest.json`, `sw.js`, `icon-*.png` | App icon and offline caching |

## Setup

### 1. GitHub + Netlify
Create a new repo, upload **all** the files, keeping the folder structure (`netlify/functions`, `netlify/lib`, `vendor`, `fonts`), and connect it to a new Netlify site. You don't need a build command, and the publish directory is the repo root.

### 2. Supabase
Paste `supabase-setup.sql` into the SQL Editor and run it.

### 3. Netlify environment variables
Go to Site configuration → Environment variables:
```
BOOTH_KEY              any long random text – paste the same text into CONFIG.boothKey in index.html
SUPABASE_URL           https://xxxx.supabase.co
SUPABASE_SERVICE_KEY   service_role key
SUPABASE_BUCKET        photobooth
KEEP_DAYS              7    (optional – change keepDays in index.html to match)
```
Redeploy after adding them.

### 4. "AI theme it" (Google Gemini via Supabase)
1. **Get a Gemini API key.** In Google AI Studio (aistudio.google.com), go to **Get API key**, then turn on **billing** for the project. The image model has no free tier, and paid keys also mean Google doesn't use your photos to train its AI.
2. **Create the function.** In Supabase, go to **Edge Functions** → **Deploy a new function** → **Via Editor**. Name it `ai-theme`, replace the template with everything in `supabase/functions/ai-theme/index.ts`, and click **Deploy**.
3. **Turn off "Verify JWT"** in that function's settings. The booth key protects it instead.
4. **Add the secrets.** Go to **Edge Functions → Secrets** and add:
   ```
   GEMINI_API_KEY   your Gemini key
   BOOTH_KEY        the same text as in Netlify and CONFIG.boothKey
   AI_DAILY_LIMIT   300   (optional – maximum AI photos per day, to cap costs)
   AI_IMAGE_SIZE    1K    (optional – 2K is sharper but costs more)
   ```
5. **Connect the tablet.** Copy the function's URL (it looks like `https://xxxx.supabase.co/functions/v1/ai-theme`) into **`aiEndpoint`** in the CONFIG block of `index.html`. The 🪄 button only appears once this is set.
6. **Test it.** The setup screen's **Demo mode** fakes the AI (it just recolours the photo), so you can try the screens without spending anything.

To add, remove or change a theme: edit the `THEMES` list in the Supabase function (what the AI does), and the `AI_THEMES` list in `index.html` (the icon, name and colours). The ids must match.

### 5. Tablet with Fully Kiosk Browser
Fully Kiosk locks the tablet to the booth, with a PIN to exit. It's a one-time 8.90 EUR + tax per tablet, and free to try.
1. Give the tablet a screen-lock **PIN** in Android Settings.
2. Install **Fully Kiosk Browser** and set the **Start URL** to your booth's Netlify address.
3. In Fully's settings, turn on:
   - **Web Content Settings → Enable Webcam Access**, and allow the camera
   - **Kiosk Mode** with a **Kiosk Exit PIN**
   - **Keep Screen On** and **Launch on Boot**
   - **Screen Orientation → Portrait**
   - hide the status and navigation bars, and disable the volume and power keys if your tablet allows it
   - **Auto Reload** when the network reconnects

   If a setting isn't where these steps say, use the search box in Fully's settings.
4. Buy the PLUS licence once you're happy.
5. **Mounting:** use a lockable enclosure. Mount the tablet in portrait with the camera at the top, at about 1.4–1.5 m, tilted slightly down. Put a floor mark 1.2–1.5 m away so groups fit in the shot. A ring light makes a big difference.
6. Put a small sign by the booth: *"Scan the code to take your photo home – screenshot to keep it. Photos are deleted after 7 days."*

### 6. Staff setup screen
Tap the **top-left corner 5 times**, then enter the **staff PIN**. The first time, it asks you to create one, so do this straight after installing.

From there you can:
- choose the camera
- change the countdown length
- turn mirroring on or off
- change the staff PIN
- turn on demo mode (nothing is uploaded, so QR codes won't open anything)

After 5 wrong PINs, the screen locks for 5 minutes. **Forgotten it?** Exit Fully with the Kiosk Exit PIN, then clear Fully's web storage. The next 5 taps will ask for a new PIN.

## Running costs
- **The booth app:** free. The Glam filter, QR codes and slideshow all run on the tablet.
- **AI theme it:** Google charges about **$0.067 (about 5p) per AI photo** at standard (1K) quality, or about $0.10 at 2K. Every theme a guest tries counts, including trying a second theme on the same photo.
  - A party where 60 guests each try one or two themes costs roughly **£3–£6**.
  - `AI_DAILY_LIMIT` (300 by default, about £15 a day at most) stops costs running away.
  - The `booth_ai_log` table shows how many were used, and which themes are most popular.
- **Netlify:** the free plan (300 credits a month) easily covers the pages and functions. Photos are **not** served through Netlify.
- **Supabase:** photos are viewed straight from Supabase storage. Each photo is about 0.5–1 MB, and is only kept for 7 days.
  - **Storage space** stays small.
  - **Viewing** (Supabase calls this "egress") is what to watch. A 100-photo party where 30 guests swipe through the gallery is roughly 1–3 GB.
  - The free plan includes **5 GB a month**. Check Supabase's usage page after the first few parties.
- **Fully Kiosk:** 8.90 EUR one-off. **Enclosure and ring light:** optional, one-off.

## Privacy
- Photos and galleries are **private by link**. The codes are long and random, so they can't be guessed, and the pages are hidden from search engines.
- **AI theme it** sends the photo to Google's Gemini AI to create the themed version. On a paid API key, Google doesn't use it to train its AI. Mention this in your privacy notice, for example: *"If you choose an AI theme, your photo is processed by Google's Gemini AI to create it."* The note on the AI screen tells guests too.
- **No personal details are collected.** There's no email, phone number or sign-up.
- At a party, every photo goes into that party's gallery, so the sign by the booth should say so.
- **Everything is deleted automatically after 7 days.** Mention this in your privacy notice, for example: *"Photo booth pictures are stored for 7 days so you can view and screenshot them, then permanently deleted."*

## Changing things
At the top of the script in `index.html`, the CONFIG block controls:
- `countdown`, the countdown length (5 seconds)
- `idleResetSeconds`, how long before the booth returns to the start screen (90 seconds)
- `takeHomeSeconds`, how long the "Take it home" QR stays up (45 seconds)
- `slideSeconds`, how long each photo shows in the slideshow (5 seconds)
- `hostHours`, how long a party runs (8 hours)
- `watermark`, the title text on every photo ("Serendipity")
- `keepDays`, how long photos stay online (7 days)
