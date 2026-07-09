-- Run this once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run)

-- user_id defaults to auth.uid() so neither the extension's REST inserts nor
-- the website's supabase-js inserts need to pass it explicitly.
-- Safe to re-run: uses IF NOT EXISTS / DROP-then-CREATE throughout.
create table if not exists public.allowlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hostname    text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, hostname)
);

create table if not exists public.site_blocks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hostname        text not null,
  block_count     integer not null default 0,
  last_blocked_at timestamptz,
  unique (user_id, hostname)
);

-- One row per calendar day a session was started, used to compute streaks.
-- day is a plain date (no time/timezone) — one row per day regardless of
-- how many sessions happened that day, via the unique constraint below.
create table if not exists public.study_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.allowlist enable row level security;
alter table public.site_blocks enable row level security;
alter table public.study_days enable row level security;

drop policy if exists "own allowlist rows" on public.allowlist;
create policy "own allowlist rows" on public.allowlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own site_blocks rows" on public.site_blocks;
create policy "own site_blocks rows" on public.site_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own study_days rows" on public.study_days;
create policy "own study_days rows" on public.study_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomic increment (avoids read-modify-write races). Called via:
-- POST /rest/v1/rpc/increment_block_count with p_hostname set to the hostname string.
create or replace function public.increment_block_count(p_hostname text)
returns void
language sql
security definer
as $$
  insert into public.site_blocks (user_id, hostname, block_count, last_blocked_at)
  values (auth.uid(), p_hostname, 1, now())
  on conflict (user_id, hostname)
  do update set block_count = site_blocks.block_count + 1,
                last_blocked_at = now();
$$;

-- Called via: POST /rest/v1/rpc/reset_site_blocks with an empty body.
create or replace function public.reset_site_blocks()
returns void
language sql
security definer
as $$
  delete from public.site_blocks where user_id = auth.uid();
$$;
