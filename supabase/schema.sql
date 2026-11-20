-- =====================================================================
-- RICEILLION DATABASE SETUP
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
--
-- What it creates:
--   answers      every answer players give (anonymous), including guesses
--                Willy hadn't heard of — this is your "missing answers" list
--   flights      each player's final score per flight
--   suggestions  answers and new prompts players suggest
--
-- Security: anyone can ADD rows (that's how the game saves answers), but
-- nobody can read, edit or delete rows through the website. The game only
-- reads the two summary functions at the bottom. You see everything in the
-- Supabase dashboard (Table Editor).
-- =====================================================================

create table if not exists public.answers (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  player      text not null check (char_length(player) between 8 and 64),
  mode        text not null check (mode in ('daily', 'unlimited')),
  flight      int,
  prompt      text not null check (char_length(prompt) <= 200),
  raw         text check (char_length(raw) <= 80),        -- what they typed
  matched     text check (char_length(matched) <= 200),   -- the answer it counted as (null = not on the list)
  points      int not null default 0 check (points between 0 and 100),
  final       boolean not null default true               -- false = a guess Willy hadn't heard of, then they tried again
);
create index if not exists answers_prompt_final on public.answers (prompt) where final;

create table if not exists public.flights (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  player      text not null check (char_length(player) between 8 and 64),
  mode        text not null check (mode in ('daily', 'unlimited')),
  flight      int,
  score       int not null check (score between 0 and 500)
);
create index if not exists flights_daily on public.flights (flight) where mode = 'daily';

create table if not exists public.suggestions (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  player      text not null check (char_length(player) between 8 and 64),
  kind        text not null check (kind in ('answer', 'prompt')),
  prompt      text not null check (char_length(prompt) between 1 and 200),
  suggestion  text not null check (char_length(suggestion) between 1 and 600),
  note        text check (char_length(note) <= 300)
);

-- Let the website add rows (newer Supabase projects don't grant this automatically).
-- Insert only: no select/update/delete is granted, so rows can't be read or changed from the site.
grant usage on schema public to anon;
grant insert on table public.answers, public.flights, public.suggestions to anon;

-- Row level security: allow inserts only.
alter table public.answers     enable row level security;
alter table public.flights     enable row level security;
alter table public.suggestions enable row level security;

drop policy if exists "players can add answers" on public.answers;
create policy "players can add answers" on public.answers for insert to anon with check (true);
drop policy if exists "players can add flights" on public.flights;
create policy "players can add flights" on public.flights for insert to anon with check (true);
drop policy if exists "players can add suggestions" on public.suggestions;
create policy "players can add suggestions" on public.suggestions for insert to anon with check (true);

-- How many times each answer was given for some prompts (only final answers).
-- answer = '' means "not on the list / timed out". The game uses this for
-- "X% of owls said this" and for crowd-based points.
create or replace function public.prompt_stats(p_prompts text[])
returns table (prompt text, answer text, n bigint)
language sql stable security definer set search_path = public
as $$
  select a.prompt, coalesce(a.matched, '') as answer, count(*) as n
  from public.answers a
  where a.final and a.prompt = any (p_prompts)
  group by a.prompt, coalesce(a.matched, '');
$$;

-- Tonight's daily scores (one per player), for the percentile and the chart.
create or replace function public.flight_stats(p_flight int)
returns table (score int, n bigint)
language sql stable security definer set search_path = public
as $$
  select s.score, count(*) as n
  from (
    select distinct on (f.player) f.score
    from public.flights f
    where f.mode = 'daily' and f.flight = p_flight
    order by f.player, f.created_at
  ) s
  group by s.score;
$$;

grant execute on function public.prompt_stats(text[]) to anon;
grant execute on function public.flight_stats(int) to anon;
