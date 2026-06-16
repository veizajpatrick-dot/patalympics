-- Patalympics Supabase schema
-- In Supabase: SQL Editor öffnen, diesen Inhalt einfügen und ausführen.
-- Wichtig: Niemals den service_role key in die Website einbauen.

create table if not exists public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_availability_answers (
  id uuid primary key default gen_random_uuid(),
  participant_name text not null,
  answers jsonb not null default '{}'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_name)
);

create table if not exists public.poll_game_suggestions (
  id uuid primary key default gen_random_uuid(),
  participant_name text not null,
  suggestion text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_game_votes (
  id uuid primary key default gen_random_uuid(),
  participant_name text not null,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_name)
);

alter table public.site_content enable row level security;
alter table public.poll_availability_answers enable row level security;
alter table public.poll_game_suggestions enable row level security;
alter table public.poll_game_votes enable row level security;

drop policy if exists "public read site content" on public.site_content;
create policy "public read site content"
on public.site_content for select
to anon
using (true);

drop policy if exists "public write site content" on public.site_content;
create policy "public write site content"
on public.site_content for insert
to anon
with check (true);

drop policy if exists "public update site content" on public.site_content;
create policy "public update site content"
on public.site_content for update
to anon
using (true)
with check (true);

drop policy if exists "public read availability" on public.poll_availability_answers;
create policy "public read availability"
on public.poll_availability_answers for select
to anon
using (true);

drop policy if exists "public write availability" on public.poll_availability_answers;
create policy "public write availability"
on public.poll_availability_answers for insert
to anon
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "public update own availability by name" on public.poll_availability_answers;
create policy "public update own availability by name"
on public.poll_availability_answers for update
to anon
using (char_length(participant_name) between 1 and 80)
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "public read suggestions" on public.poll_game_suggestions;
create policy "public read suggestions"
on public.poll_game_suggestions for select
to anon
using (true);

drop policy if exists "public write suggestions" on public.poll_game_suggestions;
create policy "public write suggestions"
on public.poll_game_suggestions for insert
to anon
with check (
  char_length(participant_name) between 1 and 80
  and char_length(suggestion) between 1 and 500
);

drop policy if exists "public read votes" on public.poll_game_votes;
create policy "public read votes"
on public.poll_game_votes for select
to anon
using (true);

drop policy if exists "public write votes" on public.poll_game_votes;
create policy "public write votes"
on public.poll_game_votes for insert
to anon
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "public update own votes by name" on public.poll_game_votes;
create policy "public update own votes by name"
on public.poll_game_votes for update
to anon
using (char_length(participant_name) between 1 and 80)
with check (char_length(participant_name) between 1 and 80);

insert into public.site_content (key, value)
values
  ('adminNewsData', '[]'::jsonb),
  ('adminCalendarData', '[]'::jsonb),
  ('adminPollData', '{
    "availability": { "published": false, "info": "", "startDate": "", "endDate": "" },
    "suggestions": { "published": false, "info": "" },
    "gameVote": { "published": false, "info": "", "groups": [] }
  }'::jsonb),
  ('adminRankingData', '{
    "mode": "solo",
    "days": [
      { "label": "Day 1", "games": ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"] },
      { "label": "Day 2", "games": ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"] }
    ],
    "players": []
  }'::jsonb)
on conflict (key) do nothing;
