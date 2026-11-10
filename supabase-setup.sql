-- Run in Supabase → SQL Editor

-- 1. Public bucket for booth photos. File names are long and random, so they can't be guessed.
insert into storage.buckets (id, name, public)
values ('photobooth', 'photobooth', true)
on conflict (id) do nothing;

-- 2. Party galleries (one per hosted party; lasts 7 days from its first photo)
create table if not exists public.booth_parties (
  id          text primary key,             -- random id, used in the gallery QR code
  name        text not null,                -- the host's photo title, e.g. "Maria's 50th"
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- 3. Photos (each has its own QR code; party photos also appear in the party gallery)
create table if not exists public.booth_photos (
  id          text primary key,             -- random id, used in the photo QR code
  party_id    text references public.booth_parties(id) on delete set null,
  in_gallery  boolean not null default false,
  path        text not null,
  thumb_path  text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists booth_photos_party on public.booth_photos (party_id, created_at desc);
create index if not exists booth_photos_expiry on public.booth_photos (expires_at);

-- Only the Netlify functions (service_role key) can read or write these tables
alter table public.booth_parties enable row level security;
alter table public.booth_photos  enable row level security;

-- No longer used now that photos are delivered by QR code instead of email:
-- drop table if exists public.photobooth_sends;

-- 4. "AI theme it" usage log – used for the daily cost cap (AI_DAILY_LIMIT) and to see how popular each theme is
create table if not exists public.booth_ai_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  theme       text not null,
  mode        text not null,               -- full | background | clothing
  ok          boolean not null,
  detail      text
);
create index if not exists booth_ai_log_created on public.booth_ai_log (created_at);
alter table public.booth_ai_log enable row level security;

-- Handy: which themes are most popular?
-- select theme, mode, count(*) from booth_ai_log where ok group by 1,2 order by 3 desc;
